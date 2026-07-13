// After the client's Stripe Payment Sheet reports success, this re-checks
// the PaymentIntent's status directly with Stripe before granting a
// credit — a client-side "success" callback is never trusted alone.
import { verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, json } from "../_shared/cors.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const identity = await verifyFirebaseToken(req.headers.get("Authorization"));
    const { paymentIntentId } = await req.json();
    if (!paymentIntentId) return json({ error: "paymentIntentId is required." }, 400);

    const supabase = getSupabaseAdmin();
    const idempotencyKey = `stripe_${paymentIntentId}`;

    const { data: alreadyDone } = await supabase.rpc("is_payment_processed", {
      p_idempotency_key: idempotencyKey,
    });
    if (alreadyDone) {
      return json({ success: true, alreadyProcessed: true });
    }

    const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const intent = await resp.json();
    if (!resp.ok) return json({ error: "Could not retrieve PaymentIntent from Stripe." }, 502);

    if (intent.status !== "succeeded") {
      return json({ success: false, status: intent.status });
    }
    if (intent.metadata?.uid !== identity.uid) {
      return json({ error: "Payment does not belong to this user." }, 403);
    }

    const { error } = await supabase.rpc("grant_credit", {
      p_firebase_uid: identity.uid,
      p_credits: 1,
      p_gateway: "stripe",
      p_gateway_order_id: null,
      p_gateway_payment_id: paymentIntentId,
      p_idempotency_key: idempotencyKey,
      p_country_code: intent.metadata?.countryCode ?? "US",
      p_currency: (intent.currency ?? "usd").toUpperCase(),
      p_base_amount: Number(intent.metadata?.base ?? 0),
      p_tax_label: intent.metadata?.taxLabel ?? null,
      p_tax_amount: Number(intent.metadata?.taxAmount ?? 0),
      p_total_amount: Number(intent.metadata?.total ?? 0),
      p_via_webhook: false,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 401);
  }
});
