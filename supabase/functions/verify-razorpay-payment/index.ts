// Independently re-verifies a Razorpay payment signature server-side before
// granting a credit — the client's word that "payment succeeded" is never
// trusted on its own.
import { verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, json } from "../_shared/cors.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

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

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const identity = await verifyFirebaseToken(req.headers.get("Authorization"));
    const { orderId, paymentId, signature } = await req.json();
    if (!orderId || !paymentId || !signature) {
      return json({ error: "orderId, paymentId, and signature are required." }, 400);
    }

    const supabase = getSupabaseAdmin();
    const idempotencyKey = `razorpay_${paymentId}`;

    const { data: alreadyDone } = await supabase.rpc("is_payment_processed", {
      p_idempotency_key: idempotencyKey,
    });
    if (alreadyDone) {
      return json({ success: true, alreadyProcessed: true });
    }

    const expectedSignature = await hmacSha256Hex(RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    if (expectedSignature !== signature) {
      return json({ error: "Payment signature verification failed." }, 403);
    }

    // Look up the order to recover the tax breakdown recorded at creation
    // time, so the payments row stays accurate for accounting.
    let notes: Record<string, string> = {};
    try {
      const basicAuth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
      const resp = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers: { Authorization: basicAuth },
      });
      const order = await resp.json();
      notes = order?.notes ?? {};
    } catch (_e) {
      // non-fatal — signature check above already proved the payment is genuine
    }

    const { error } = await supabase.rpc("grant_credit", {
      p_firebase_uid: identity.uid,
      p_credits: 1,
      p_gateway: "razorpay",
      p_gateway_order_id: orderId,
      p_gateway_payment_id: paymentId,
      p_idempotency_key: idempotencyKey,
      p_country_code: notes.countryCode ?? "IN",
      p_currency: "INR",
      p_base_amount: Number(notes.base ?? 0),
      p_tax_label: notes.taxLabel ?? null,
      p_tax_amount: Number(notes.taxAmount ?? 0),
      p_total_amount: Number(notes.total ?? 0),
      p_via_webhook: false,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 401);
  }
});
