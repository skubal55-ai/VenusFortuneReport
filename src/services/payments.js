// Client-side payment orchestration.
// IMPORTANT: the client never decides "payment succeeded" on its own —
// every path below ends in a server-side verification call (Supabase Edge
// Function) before any credit is granted. This prevents a modified/fake
// client from unlocking a report without actually paying. Likewise, the
// client never tells the server how much to charge — every amount
// (base + tax) is looked up server-side from the country code alone.
import RazorpayCheckout from "react-native-razorpay";
import { callSupabaseFunction } from "./supabaseFunctions";

/**
 * Fetch the authoritative price breakdown (base, tax, total) for a country
 * directly from the server — use this to render the Payment screen instead
 * of trusting only the local copy in services/pricing.js, so the displayed
 * price can never drift from what will actually be charged. Public
 * endpoint — no login required just to see a price.
 * @param {string} countryCode
 */
export async function fetchPricing(countryCode) {
  return callSupabaseFunction("get-pricing", { countryCode }, { requireAuth: false });
}

/**
 * Pay via Razorpay (India / INR). The amount charged (base + tax) is decided
 * entirely by the server from countryCode — this function never sends an
 * amount to the server.
 * @param {{countryCode:string, name:string, email:string}} params
 * @returns {Promise<{success:boolean}>}
 */
export async function payWithRazorpay({ countryCode, name, email }) {
  const { orderId, keyId, amount, currency } = await callSupabaseFunction("create-razorpay-order", {
    countryCode,
  });

  const options = {
    description: "Venus Report",
    image: undefined,
    currency,
    key: keyId,
    amount, // paise, includes tax — set by the server
    name: "Venus Report",
    order_id: orderId,
    prefill: { email, name },
    theme: { color: "#c76b8a" },
  };

  const paymentResult = await RazorpayCheckout.open(options);
  // paymentResult: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
  return callSupabaseFunction("verify-razorpay-payment", {
    orderId: paymentResult.razorpay_order_id,
    paymentId: paymentResult.razorpay_payment_id,
    signature: paymentResult.razorpay_signature,
  });
}

/**
 * Create a Stripe PaymentIntent for the given country (server computes
 * base + tax and the charged amount from countryCode alone).
 * Actual presentation of the Payment Sheet happens in the screen via
 * @stripe/stripe-react-native's useStripe() hook (needs React context),
 * this just prepares the clientSecret.
 */
export async function createStripeIntent({ countryCode }) {
  return callSupabaseFunction("create-stripe-intent", { countryCode });
}

/**
 * After the Stripe Payment Sheet reports success client-side, ask the
 * server to re-check the PaymentIntent status directly with Stripe before
 * granting a credit.
 */
export async function confirmStripePayment({ paymentIntentId }) {
  return callSupabaseFunction("confirm-stripe-payment", { paymentIntentId });
}
