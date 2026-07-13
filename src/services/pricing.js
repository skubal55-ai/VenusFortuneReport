// Country -> currency / base price / tax / payment gateway mapping.
//
// IMPORTANT — this file is for DISPLAY only. The actual charged amount is
// always computed again from scratch on the server (functions/pricing.js)
// using the country code alone — the client never gets to tell the server
// how much to charge (that would let a modified app just send a lower
// amount). Keep the two files in sync when you change prices/tax rates.
//
// Tax rates below are common illustrative defaults for B2C digital/
// information services, NOT verified tax advice:
//   India:  GST 18% (standard rate applied to most digital/OIDAR services)
//   UAE:    VAT 5%
//   UK:     VAT 20%
//   EU:     VAT is actually set per member state (~17-27%) under the EU
//           OSS scheme — 21% here is a representative placeholder only.
//           For real compliance you'd register for OSS and charge the
//           customer's own country's rate, or use an automated tax engine
//           (e.g. Stripe Tax) instead of this static table.
//   US:     Sales tax on digital goods varies by state/locality (0% in
//           many states, ~4-10% in others) and depends on economic nexus —
//           set to 0% here; do not treat this as "no tax owed", it means
//           "not calculated here, needs proper state-level configuration
//           or an automated tax engine before launch."
// Confirm all of the above with a qualified tax professional before
// charging real customers.
export const COUNTRIES = [
  { code: "IN", name: "India", currency: "INR", baseAmount: 200, symbol: "₹", gateway: "razorpay", taxRate: 0.18, taxLabel: "GST" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", baseAmount: 100, symbol: "AED", gateway: "stripe", taxRate: 0.05, taxLabel: "VAT" },
  { code: "US", name: "United States", currency: "USD", baseAmount: 50, symbol: "$", gateway: "stripe", taxRate: 0.00, taxLabel: "Sales Tax" },
  { code: "EU", name: "Europe (Eurozone)", currency: "EUR", baseAmount: 100, symbol: "€", gateway: "stripe", taxRate: 0.21, taxLabel: "VAT (est.)" },
  { code: "GB", name: "United Kingdom", currency: "GBP", baseAmount: 50, symbol: "£", gateway: "stripe", taxRate: 0.20, taxLabel: "VAT" },
];

export function getCountryByCode(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

/**
 * Returns a full price breakdown for display: base, tax amount, total —
 * each rounded to 2 decimals (whole currency units, e.g. rupees not paise).
 */
export function computePricing(countryCode) {
  const country = getCountryByCode(countryCode);
  const base = country.baseAmount;
  const taxAmount = Math.round(base * country.taxRate * 100) / 100;
  const total = Math.round((base + taxAmount) * 100) / 100;
  return {
    ...country,
    base,
    taxAmount,
    total,
  };
}
