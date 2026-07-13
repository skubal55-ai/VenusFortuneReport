// Creates a Razorpay order for the authenticated user's country. The
// charged amount (base + tax) is always looked up server-side from the
// country code alone — this function never accepts an amount from the
// client, so a modified app build can never charge itself less.
import { verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { computePricing } from "../_shared/pricing.ts";
import { handleOptions, json } from "../_shared/cors.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const identity = await verifyFirebaseToken(req.headers.get("Authorization"));
    const { countryCode } = await req.json();
    if (!countryCode) return json({ error: "countryCode is required." }, 400);

    const pricing = computePricing(countryCode);
    if (pricing.gateway !== "razorpay") {
      return json({ error: "This country is not configured for Razorpay." }, 400);
    }

    const supabase = getSupabaseAdmin();
    await supabase.rpc("find_or_create_user", {
      p_firebase_uid: identity.uid,
      p_email: identity.email ?? "",
    });

    const basicAuth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const resp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: basicAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(pricing.total * 100), // paise
        currency: pricing.currency,
        receipt: `receipt_${identity.uid}_${Date.now()}`,
        notes: {
          countryCode,
          base: String(pricing.base),
          taxLabel: pricing.taxLabel,
          taxAmount: String(pricing.taxAmount),
          total: String(pricing.total),
        },
      }),
    });
    const order = await resp.json();
    if (!resp.ok) {
      return json({ error: order?.error?.description ?? "Razorpay order creation failed." }, 502);
    }

    return json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
      pricing,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 401);
  }
});
