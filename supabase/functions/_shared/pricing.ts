// Server-side source of truth for pricing + tax — the ONLY place that
// decides how much a customer is actually charged. The app's local copy
// (src/services/pricing.js) is for instant display only; every order/
// PaymentIntent creation function below calls computePricing() here from a
// country code alone, never trusting an amount sent by the client.
//
// See src/services/pricing.js for the tax-rate caveats (illustrative
// defaults, not verified tax advice).
export interface CountryPricing {
  currency: string;
  baseAmount: number;
  taxRate: number;
  taxLabel: string;
  gateway: "razorpay" | "stripe";
}

export const COUNTRIES: Record<string, CountryPricing> = {
  IN: { currency: "INR", baseAmount: 200, taxRate: 0.18, taxLabel: "GST", gateway: "razorpay" },
  AE: { currency: "AED", baseAmount: 100, taxRate: 0.05, taxLabel: "VAT", gateway: "stripe" },
  US: { currency: "USD", baseAmount: 50, taxRate: 0.0, taxLabel: "Sales Tax", gateway: "stripe" },
  EU: { currency: "EUR", baseAmount: 100, taxRate: 0.21, taxLabel: "VAT (est.)", gateway: "stripe" },
  GB: { currency: "GBP", baseAmount: 50, taxRate: 0.2, taxLabel: "VAT", gateway: "stripe" },
};

export function computePricing(countryCode: string) {
  const country = COUNTRIES[countryCode];
  if (!country) {
    throw new Error(`Unknown country code: ${countryCode}`);
  }
  const base = country.baseAmount;
  const taxAmount = Math.round(base * country.taxRate * 100) / 100;
  const total = Math.round((base + taxAmount) * 100) / 100;
  return { ...country, countryCode, base, taxAmount, total };
}
