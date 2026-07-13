# Venus Report — Native App (Expo / React Native)

A native iOS + Android app that generates a detailed Venus/Shukra astrology
report (Western + Vedic) from birth date, time, and place, gated behind
login + country-based payment (Razorpay for India, Stripe for
international), with a free/admin bypass for a designated account.

**Architecture:** Firebase Authentication handles login/signup only (free
Spark plan, no billing needed). Everything else — credits, payments, report
history, and all payment-verification logic — lives in your own Supabase
Postgres database, reached through Supabase Edge Functions. There is no
Firestore and no Firebase Cloud Functions anywhere in this project.

This README covers: what's already built, what you still need to configure
with your own accounts/keys, how to run and test it locally, and how to
publish it to the App Store and Google Play.

---

## 1. What's already built

- **Astrology engine** (`src/astro/calculations.js`): real astronomical
  Venus/Sun position via `astronomy-engine`, tropical (Western) + sidereal
  Lahiri-ayanamsa (Vedic) sign, nakshatra/pada, whole-sign house placement,
  dignity (exalted/own/debilitated), combustion, retrograde, and a strength
  score. Verified against known Venus retrograde/direct periods and several
  sample charts (see `src/astro/__tests__`).
- **Detailed content** (`src/astro/content.js`): love/wealth/health writeups
  per sign (Western + Vedic), per-house meaning, and a remedies section
  (daily practice, weekly Friday practice, a structured 16-Friday Shukra
  sadhana, gemstone guidance with cautions, wealth/health lifestyle tips,
  modern/Western-style practices).
- **Screens**: Birth Details → Login/Signup → Payment (country-based
  pricing with a base + tax breakdown) → Report (with PDF download).
- **Firebase Auth**: email/password login/signup — nothing else from
  Firebase is used.
- **Supabase Postgres schema** (`db/schema.sql`): `users` (linked by
  Firebase `uid`, holding credits + admin flag), `payments` (audit trail,
  idempotency-protected against double-crediting), `reports` (history).
  Includes SQL functions (`find_or_create_user`, `grant_credit`,
  `unlock_report`, `is_payment_processed`) so the critical logic lives
  next to the data, and a trigger that auto-upgrades the designated admin
  account the moment its row is created.
- **Supabase Edge Functions** (`supabase/functions/`): verify a Firebase ID
  token directly against Google's public keys (no Firebase Admin SDK
  needed), create Razorpay orders / Stripe PaymentIntents, **independently
  re-verify every payment server-side** before granting credit, and a
  Stripe webhook as a backup confirmation path.
- **Row Level Security**: enabled on every table with no client-facing
  policies — the only way into the database is the `service_role` key,
  which lives only inside Edge Functions and is never shipped in the app.

## 2. What you still need to do yourself

I can't create accounts or hold funds on your behalf — these steps need
your own identity/business details:

1. **Firebase project** (free, Auth only) — https://console.firebase.google.com
   - Create a project, enable **Authentication → Email/Password**.
   - Project settings → General → "Your apps" → add a Web app → copy the
     config object into `src/services/firebase.js` (replace the
     `REPLACE_ME` values).
   - You do **not** need to enable Firestore, and you do **not** need the
     Blaze (paid) plan — Authentication alone stays on the free Spark plan.

2. **Supabase project** (free tier) — https://supabase.com
   - Create a project. Note your **Project URL** and **project ref**
     (Project Settings → API) — the ref is the subdomain in your project
     URL, e.g. `abcdefghijklmno` in `https://abcdefghijklmno.supabase.co`.
   - Open the **SQL Editor** and run the entire contents of `db/schema.sql`
     once. Before running it, edit the email inside
     `apply_admin_default()` if you want a different admin address than
     `skubal52@gmail.com`.
   - Install the Supabase CLI (`npm install -g supabase`), run
     `supabase login`, then `supabase link --project-ref <your-ref>` inside
     this folder.
   - Set `supabase/config.toml`'s `project_id` to your project ref.
   - Set secrets the Edge Functions need:
     ```
     supabase secrets set FIREBASE_PROJECT_ID=your-firebase-project-id
     supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx
     supabase secrets set RAZORPAY_KEY_SECRET=xxx
     supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
     supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
     ```
   - Deploy all functions:
     ```
     supabase functions deploy get-pricing --no-verify-jwt
     supabase functions deploy create-razorpay-order --no-verify-jwt
     supabase functions deploy verify-razorpay-payment --no-verify-jwt
     supabase functions deploy create-stripe-intent --no-verify-jwt
     supabase functions deploy confirm-stripe-payment --no-verify-jwt
     supabase functions deploy stripe-webhook --no-verify-jwt
     supabase functions deploy unlock-report --no-verify-jwt
     supabase functions deploy get-profile --no-verify-jwt
     ```
     `--no-verify-jwt` is required — these functions receive a **Firebase**
     ID token in the Authorization header, not a Supabase one, and verify
     it themselves (see `supabase/functions/_shared/firebaseAuth.ts`).
     Without this flag, Supabase's own gateway rejects the request before
     your code ever runs.
   - Put your Project URL into `src/services/supabaseFunctions.js`
     (replace `SUPABASE_FUNCTIONS_URL`'s placeholder).

3. **Razorpay account** (India payments) — https://dashboard.razorpay.com/signup
   - Complete KYC/business verification.
   - Get your Key ID + Key Secret from Settings → API Keys (use the
     **test-mode** ones while developing — see the Testing section).

4. **Stripe account** (international payments) — https://dashboard.stripe.com/register
   - Get your **publishable key** → paste into `App.js`
     (`STRIPE_PUBLISHABLE_KEY`).
   - Get your **secret key** → set as a Supabase secret (above).
   - Create a webhook endpoint (Developers → Webhooks) pointing to your
     deployed `stripe-webhook` function's URL (shown after deploying),
     subscribed to `payment_intent.succeeded`, then set
     `STRIPE_WEBHOOK_SECRET` as shown above.

5. **Apple Developer Program** ($99/year) — https://developer.apple.com/programs
6. **Google Play Console** ($25 one-time) — https://play.google.com/console/signup

7. **Tax/compliance**: collecting payments in INR/AED/USD/EUR/GBP across
   multiple countries has real tax (GST, VAT) and payment-license
   implications that vary by where your business is registered. Please
   confirm the correct setup with an accountant/lawyer before going live —
   this app only handles the technical charge, not tax registration.

## 3. Tax calculation

Every price shown or charged is a **base amount + tax**, computed the same
way on both the client (for instant display) and the server (as the only
authoritative source used to actually charge the customer):

| Country | Base | Tax | Rate | Total (example) |
|---|---|---|---|---|
| India | ₹200 | GST | 18% | ₹236 |
| UAE | AED 100 | VAT | 5% | AED 105 |
| US | $50 | Sales Tax | 0% (placeholder) | $50 |
| EU (Eurozone) | €100 | VAT | 21% (representative estimate) | €121 |
| UK | £50 | VAT | 20% | £60 |

This lives in two files that must be kept in sync:
- `src/services/pricing.js` — client-side copy, used only to render the
  Payment screen's breakdown instantly (base / tax / total).
- `supabase/functions/_shared/pricing.ts` — the real source of truth.
  `PaymentScreen.js` also calls the `get-pricing` Edge Function on load to
  double-check the displayed price against the server before payment, and
  the order/PaymentIntent creation functions (`create-razorpay-order`,
  `create-stripe-intent`) **only ever accept a country code** from the
  client, never an amount — the server looks up base+tax+total itself.
  This closes off the obvious attack of a modified app client just sending
  a lower amount.

Important caveats (not tax advice):
- The **India GST (18%)** and **UK/UAE VAT** rates are standard rates for
  most digital/informational services, but confirm applicability for your
  specific registration and service classification.
- The **EU rate (21%)** is a representative placeholder only — real EU VAT
  is charged at the *customer's own country's rate* (roughly 17–27%
  depending on the member state) under the One-Stop-Shop (OSS) scheme,
  which requires its own registration.
- The **US rate is set to 0%** deliberately as a placeholder, not because
  no tax is owed — US sales tax on digital goods depends on state-level
  rules and your economic nexus, and needs proper configuration (or an
  automated engine like **Stripe Tax**) before real launch.

## 4. Run it locally (development)

```
npm install
npx expo start
```
Scan the QR code with **Expo Go** (quickest way to see it on your phone
during development). If your phone can't reach your computer directly
(common on corporate/VPN networks), use `npx expo start --tunnel` instead.

Note Expo Go can't test Stripe/Razorpay native modules; for that use a
**development build** instead:
```
npx expo prebuild
npx expo run:android    # requires Android Studio
npx expo run:ios        # requires a Mac + Xcode
```

## 5. Testing

There are four layers, from fastest/no-setup to full end-to-end:

### Layer 1 — Pure logic tests (no Expo, no device, seconds to run)
```
npm install
npm test
```
Runs Jest against `src/astro/__tests__/calculations.test.js` and
`src/services/__tests__/pricing.test.js` — the astrology math and the
pricing/tax breakdown, including a check that the client pricing table can
never drift from the server's.

### Layer 2 — Quick UI smoke test via Expo Go
```
npx expo start
```
Fastest way to click through Birth Details → Login → Report. Payment will
error here since Expo Go can't load native Razorpay/Stripe modules — either
set a test user's `credits` directly in the Supabase Table Editor, or use
the admin account to skip Payment entirely (see below).

### Layer 3 — Local Supabase + Firebase Auth emulator (full backend, no real accounts touched)
```
npm install -g supabase
supabase start
```
This runs a full local Postgres + Edge Functions environment (with a
Studio UI, URL printed on start) using the schema from `db/schema.sql` —
apply it once against the local instance the same way you would in
production. Separately, run the Firebase Auth emulator:
```
npm install -g firebase-tools
firebase emulators:start
```
Then start the app pointed at the local Auth emulator:
```
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1 npx expo start
```
(You'll also need to temporarily point `SUPABASE_FUNCTIONS_URL` in
`src/services/supabaseFunctions.js` at your local Supabase functions URL,
e.g. `http://localhost:54321/functions/v1`, while testing this way.)

### Layer 4 — Full native dev build (real Razorpay/Stripe test-mode payments)
Native payment SDKs only work in a real dev build, not Expo Go:
```
npx expo prebuild
npx expo run:android    # needs Android Studio + an emulator or USB device
npx expo run:ios        # needs a Mac + Xcode
```
or build one in the cloud instead of locally:
```
eas build --profile development --platform android
```
Then use **test-mode** credentials so nothing real is charged:
- **Razorpay**: use your test-mode Key ID/Secret (Dashboard → toggle "Test
  Mode"). Test card: `4111 1111 1111 1111`, any future expiry, any CVV.
  Test UPI ID: `success@razorpay`.
- **Stripe**: use your test-mode publishable/secret keys (they start with
  `pk_test_...` / `sk_test_...`, already the placeholders in this project).
  Test card: `4242 4242 4242 4242`, any future expiry, any CVV/ZIP.
  Full list: https://docs.stripe.com/testing

### Testing the admin account
Sign up or log in with `skubal52@gmail.com` in any of the layers above —
the `apply_admin_default` Postgres trigger (in `db/schema.sql`) upgrades it
automatically the moment its row is created, so it should skip the Payment
screen entirely and go straight to the Report screen (with a small "Admin
account" note at the bottom of the report).

## 6. Publishing to the App Store (iOS) and Google Play (Android)

This project uses **EAS Build**, Expo's cloud build service — it builds
signed iOS and Android binaries without you needing a Mac.

### One-time setup
```
npm install -g eas-cli
eas login
eas build:configure
```
This links the project to your Expo account and fills in the `projectId`
in `app.json`.

### Android → Google Play
1. `eas build --platform android --profile production`
   EAS builds an `.aab` (Android App Bundle) in the cloud and gives you a
   download link.
2. In **Google Play Console**: create an app → fill in store listing
   (title, description, screenshots, privacy policy URL, content rating,
   data-safety form — required since this app handles payments/logins) →
   upload the `.aab` under **Production → Create new release**.
3. Or skip the manual upload: `eas submit --platform android` uploads
   directly if you provide a Google Service Account JSON key (Play Console
   → Setup → API access).
4. Submit for review — Google review is typically a few hours to a couple
   of days.

### iOS → App Store
1. In **App Store Connect** (https://appstoreconnect.apple.com): create a
   new app (bundle ID must match `app.json`'s `ios.bundleIdentifier`,
   currently `com.suchi.venusreport` — change this to your own reverse-DNS
   ID), fill in the listing, screenshots, privacy policy URL, and answer
   the **App Privacy** questionnaire (required: you collect email + payment
   data).
2. `eas build --platform ios --profile production`
   EAS handles certificates/provisioning profiles for you interactively on
   first run (choose "Let Expo handle it").
3. `eas submit --platform ios` uploads the build to App Store Connect
   automatically (needs an app-specific password or API key from Apple).
4. In App Store Connect, attach the uploaded build to your app version and
   submit for review. Apple review typically takes 1–3 days; apps with
   payments/subscriptions are scrutinized more closely — since this uses
   Razorpay/Stripe for a **digital informational report** (not unlocking
   app functionality/content within an Apple ecosystem sense), this
   generally qualifies for external payment processing rather than
   mandatory Apple In-App Purchase, but Apple's reviewers make the final
   call — read Apple's guideline 3.1.1 and be ready to explain the
   product if asked.

### After approval
Both stores let you push updates by repeating `eas build` + `eas submit`
with an incremented version number (`autoIncrement` is already set in
`eas.json` for production builds).

## 7. Admin account

`skubal52@gmail.com` is hardcoded as the admin email in three places that
must stay in sync: `src/services/firebase.js` (`ADMIN_EMAIL`, display only),
`db/schema.sql`'s `apply_admin_default()` trigger (the actual authority),
and nowhere else — the old Firebase-Cloud-Functions version of this project
also had it in `functions/index.js`, which no longer exists. Signing up or
logging in with that exact email automatically gets unlimited credits
(free reports, no payment prompt), granted at the database level the
moment the row is first created — the client cannot self-grant this
(Row Level Security blocks direct writes to `users.is_admin`/`credits`
from anything but the `service_role` key).

## 8. Content & disclaimer note

The remedies section includes a structured, traditional 16-Friday practice
alongside daily/weekly practices, gemstone guidance, and wealth/health
lifestyle tips. These are framed as traditional devotional/lifestyle
practice, not a guaranteed or measurable timeline for results — the app
includes a disclaimer to that effect, which is worth keeping for both
legal and honesty reasons once this is a paid product.
