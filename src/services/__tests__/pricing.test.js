import { COUNTRIES, computePricing } from "../pricing";
// eslint-disable-next-line import/no-commonjs
const serverPricing = require("../../../functions/pricing");

describe("client pricing table", () => {
  test.each(COUNTRIES.map((c) => c.code))("computes base+tax+total for %s", (code) => {
    const p = computePricing(code);
    expect(p.total).toBeCloseTo(p.base + p.taxAmount, 2);
    expect(p.total).toBeGreaterThanOrEqual(p.base);
  });

  test("matches the server-side pricing table exactly (client/server drift guard)", () => {
    for (const c of COUNTRIES) {
      const client = computePricing(c.code);
      const server = serverPricing.computePricing(c.code);
      expect(client.base).toBe(server.base);
      expect(client.taxAmount).toBe(server.taxAmount);
      expect(client.total).toBe(server.total);
      expect(client.currency).toBe(server.currency);
    }
  });
});
