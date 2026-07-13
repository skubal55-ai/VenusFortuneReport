-- ============================================================================
-- Venus Report — Supabase Postgres schema
--
-- Architecture: Firebase Authentication stays (free Spark plan, no billing
-- required) purely for login/signup/session tokens. Everything else that
-- used to live in Firestore + Firebase Cloud Functions — credits, payments,
-- report history, and all payment-verification logic — now lives here in
-- Postgres, accessed only through Supabase Edge Functions
-- (supabase/functions/), never directly from the app.
--
-- Why "firebase_uid" instead of a users.email/password: this database has
-- no idea what a Firebase user's password is (and never should). Every row
-- here is linked to a Firebase user purely by their `uid` — the app sends a
-- Firebase ID token on every request, an Edge Function verifies it against
-- Google's public keys, and only then reads/writes the row matching that uid.
--
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- USERS
-- One row per Firebase-authenticated person. Created lazily (on first API
-- call after signup) by find_or_create_user() below — the app never inserts
-- into this table directly.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  credits      INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_users_email ON users (LOWER(email));

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Auto-upgrades the designated admin email the moment their row is first
-- created — the database-level equivalent of the old onUserCreate Cloud
-- Function trigger. Keep this email in sync with anywhere else it's
-- referenced (currently also src/services/firebase.js's ADMIN_EMAIL).
CREATE OR REPLACE FUNCTION apply_admin_default() RETURNS TRIGGER AS $$
BEGIN
  IF LOWER(NEW.email) = LOWER('skubal52@gmail.com') THEN
    NEW.is_admin := TRUE;
    NEW.credits  := 999999;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_admin_default
BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION apply_admin_default();

-- Row Level Security is enabled with NO policies defined below, which means
-- Postgres denies ALL access by default to any client using the public
-- "anon" or "authenticated" Supabase keys. The only way in is the
-- `service_role` key, which is kept server-side inside Edge Functions and
-- never shipped in the app. This is the Postgres equivalent of the
-- firestore.rules file from the Firebase version of this project.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PAYMENTS
-- One row per verified payment (or webhook confirmation). idempotency_key
-- guarantees a single payment can never grant credits twice, even if the
-- client retries a call or a webhook fires more than once for the same
-- event — the UNIQUE constraint makes a duplicate insert simply fail.
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  gateway            TEXT NOT NULL CHECK (gateway IN ('razorpay', 'stripe')),
  gateway_order_id   TEXT,              -- Razorpay order id
  gateway_payment_id TEXT,              -- Razorpay payment id / Stripe PaymentIntent id
  idempotency_key    TEXT NOT NULL UNIQUE,
  country_code       CHAR(2) NOT NULL,
  currency           CHAR(3) NOT NULL,
  base_amount        NUMERIC(10, 2) NOT NULL,
  tax_label          TEXT,
  tax_amount         NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(10, 2) NOT NULL,
  credits_granted    INTEGER NOT NULL DEFAULT 1,
  via_webhook        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user_id ON payments (user_id);
CREATE INDEX idx_payments_created_at ON payments (created_at);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- REPORTS  (optional, but recommended)
-- One row per birth-detail submission, so a user's past reports can be
-- listed later instead of re-entering details and re-paying, and so you
-- have a record of what was actually delivered for each payment.
-- ----------------------------------------------------------------------------
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payment_id      UUID REFERENCES payments (id),
  name            TEXT,
  birth_date      DATE NOT NULL,
  birth_time      TIME NOT NULL,
  birth_place     TEXT,
  latitude        NUMERIC(9, 6) NOT NULL,
  longitude       NUMERIC(9, 6) NOT NULL,
  tz_offset_hours NUMERIC(4, 2) NOT NULL,
  unlocked_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_user_id ON reports (user_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTIONS
-- The Edge Functions (supabase/functions/) call these instead of building
-- raw queries — keeps the security-critical logic (crediting, idempotency,
-- atomic credit deduction) in one place, tested independently of any
-- particular function's JS/TS code. All are SECURITY DEFINER so they run
-- with the privileges of the function owner regardless of RLS, since only
-- the service-role key (used exclusively by Edge Functions) ever calls them.
-- ============================================================================

-- Finds a user by Firebase uid, creating the row on first sight. Safe to
-- call on every request — cheap no-op after the first time.
CREATE OR REPLACE FUNCTION find_or_create_user(p_firebase_uid TEXT, p_email TEXT)
RETURNS users AS $$
DECLARE
  u users;
BEGIN
  SELECT * INTO u FROM users WHERE firebase_uid = p_firebase_uid;
  IF NOT FOUND THEN
    INSERT INTO users (firebase_uid, email)
    VALUES (p_firebase_uid, p_email)
    RETURNING * INTO u;
  END IF;
  RETURN u;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Returns true if this idempotency key has already been recorded — callers
-- use this to skip re-granting credit for a payment they've already seen.
CREATE OR REPLACE FUNCTION is_payment_processed(p_idempotency_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM payments WHERE idempotency_key = p_idempotency_key);
$$ LANGUAGE sql SECURITY DEFINER;

-- Atomically credits a user and records the payment row in one transaction
-- (a function body is already one transaction). Relies on the UNIQUE
-- constraint on idempotency_key as the final backstop against double-
-- crediting even under concurrent requests.
CREATE OR REPLACE FUNCTION grant_credit(
  p_firebase_uid       TEXT,
  p_credits            INTEGER,
  p_gateway            TEXT,
  p_gateway_order_id   TEXT,
  p_gateway_payment_id TEXT,
  p_idempotency_key    TEXT,
  p_country_code       CHAR(2),
  p_currency           CHAR(3),
  p_base_amount        NUMERIC,
  p_tax_label          TEXT,
  p_tax_amount         NUMERIC,
  p_total_amount       NUMERIC,
  p_via_webhook        BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE firebase_uid = p_firebase_uid;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'grant_credit: no user found for firebase_uid %', p_firebase_uid;
  END IF;

  INSERT INTO payments (
    user_id, gateway, gateway_order_id, gateway_payment_id, idempotency_key,
    country_code, currency, base_amount, tax_label, tax_amount, total_amount,
    credits_granted, via_webhook
  ) VALUES (
    v_user_id, p_gateway, p_gateway_order_id, p_gateway_payment_id, p_idempotency_key,
    p_country_code, p_currency, p_base_amount, p_tax_label, p_tax_amount, p_total_amount,
    p_credits, p_via_webhook
  );
  -- If idempotency_key already exists, the INSERT above raises a unique
  -- violation and this whole function aborts (no credit applied) — exactly
  -- the "already processed" safety net we want.

  UPDATE users SET credits = credits + p_credits WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically checks and consumes one credit (or passes free for admins).
-- Uses SELECT ... FOR UPDATE to lock the row for the duration of the
-- transaction, so two simultaneous requests can't both succeed off a
-- single remaining credit.
CREATE OR REPLACE FUNCTION unlock_report(p_firebase_uid TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_credits  INTEGER;
BEGIN
  SELECT is_admin, credits INTO v_is_admin, v_credits
  FROM users WHERE firebase_uid = p_firebase_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_is_admin THEN
    RETURN TRUE;
  END IF;

  IF v_credits > 0 THEN
    UPDATE users SET credits = credits - 1 WHERE firebase_uid = p_firebase_uid;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
