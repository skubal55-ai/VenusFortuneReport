// Backup confirmation path: Stripe calls this directly (not the app), so
// there's no Firebase token to check here — instead this verifies Stripe's
// own webhook signature, using the same HMAC construction Stripe's official
// SDKs use, implemented directly since the Node Stripe SDK isn't available
// in this Deno runtime.
//
// Configure this URL in Stripe Dashboard -> Developers -> Webhooks, and
// subscribe to the "payment_intent.succeeded" event. Then set the signing
// secret it gives you: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { json } from "../_shared/cors.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const TOLERANCE_SECONDS = 300; // reject events signed more than 5 minutes ago

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(rawBody: string, sigHeader: string | null): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isNaN(age) || age > TOLERANCE_SECONDS) return false;

  const expected = await hmacSha256Hex(STRIPE_WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
  return expected === v1;
}

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const valid = await verifyStripeSignature(rawBody, req.headers.get("stripe-signature"));
  if (!valid) {
    return json({ error: "Webhook signature verification failed." }, 400);
  }

  const event = JSON.parse(rawBody);

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const uid = intent.metadata?.uid;
    if (uid) {
      const supabase = getSupabaseAdmin();
      const idempotencyKey = `stripe_${intent.id}`;

      const { data: alreadyDone } = await supabase.rpc("is_payment_processed", {
        p_idempotency_key: idempotencyKey,
      });

      if (!alreadyDone) {
        await supabase.rpc("find_or_create_user", {
          p_firebase_uid: uid,
          p_email: "",
        });
        await supabase.rpc("grant_credit", {
          p_firebase_uid: uid,
          p_credits: 1,
          p_gateway: "stripe",
          p_gateway_order_id: null,
          p_gateway_payment_id: intent.id,
          p_idempotency_key: idempotencyKey,
          p_country_code: intent.metadata?.countryCode ?? "US",
          p_currency: (intent.currency ?? "usd").toUpperCase(),
          p_base_amount: Number(intent.metadata?.base ?? 0),
          p_tax_label: intent.metadata?.taxLabel ?? null,
          p_tax_amount: Number(intent.metadata?.taxAmount ?? 0),
          p_total_amount: Number(intent.metadata?.total ?? 0),
          p_via_webhook: true,
        });
      }
    }
  }

  return json({ received: true });
});
