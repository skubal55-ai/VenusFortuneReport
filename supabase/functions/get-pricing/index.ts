// Public endpoint (no auth required) — lets the app show an authoritative
// price breakdown before payment instead of relying only on its own local
// copy of the pricing table.
import { computePricing } from "../_shared/pricing.ts";
import { corsHeaders, handleOptions, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { countryCode } = await req.json();
    if (!countryCode) {
      return json({ error: "countryCode is required." }, 400);
    }
    return json(computePricing(countryCode));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
