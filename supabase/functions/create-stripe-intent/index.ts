// Creates a Stripe PaymentIntent for the authenticated user's country. As
// with Razorpay, the server (never the client) decides the charged amount.
import { verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { computePricing } from "../_shared/pricing.ts";
import { handleOptions, json } from "../_shared/cors.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const identity = await verifyFirebaseToken(req.headers.get("Authorization"));
    const { countryCode } = await req.json();
    if (!countryCode) return json({ error: "countryCode is required." }, 400);

    const pricing = computePricing(countryCode);
    if (pricing.gateway !== "stripe") {
      return json({ error: "This country is not configured for Stripe." }, 400);
    }

    const supabase = getSupabaseAdmin();
    await supabase.rpc("find_or_create_user", {
      p_firebase_uid: identity.uid,
      p_email: identity.email ?? "",
    });

    const body = new URLSearchParams({
      amount: String(Math.round(pricing.total * 100)),
      currency: pricing.currency.toLowerCase(),
      "metadata[uid]": identity.uid,
      "metadata[countryCode]": countryCode,
      "metadata[base]": String(pricing.base),
      "metadata[taxLabel]": pricing.taxLabel,
      "metadata[taxAmount]": String(pricing.taxAmount),
      "metadata[total]": String(pricing.total),
    });

    const resp = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const intent = await resp.json();
    if (!resp.ok) {
      return json({ error: intent?.error?.message ?? "Stripe PaymentIntent creation failed." }, 502);
    }

    return json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, pricing });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 401);
  }
});
