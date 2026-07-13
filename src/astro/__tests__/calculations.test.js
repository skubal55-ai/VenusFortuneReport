import { computeVenusChart, signIndex, angDiff } from "../calculations";

describe("computeVenusChart", () => {
  test("Mumbai 1990-05-15 14:30 IST — matches independently verified reference values", () => {
    const chart = computeVenusChart({
      y: 1990, mo: 5, d: 15, hh: 14, mm: 30,
      lat: 19.076, lon: 72.877, tzOffsetHrs: 5.5,
    });
    expect(chart.westernSign).toBe("Aries");
    expect(chart.vedicSign).toBe("Pisces");
    expect(chart.dignity.label).toBe("Exalted");
    expect(chart.nakshatra).toBe("Revati");
    expect(chart.pada).toBe(1);
    expect(chart.westernHouse).toBe(2);
    expect(chart.vedicHouse).toBe(2);
    expect(chart.retrograde).toBe(false);
    expect(chart.combust).toBe(false);
    expect(chart.score).toBe(80);
  });

  test("houses are always within 1-12", () => {
    const chart = computeVenusChart({
      y: 2000, mo: 1, d: 1, hh: 0, mm: 0,
      lat: 51.5074, lon: -0.1278, tzOffsetHrs: 0,
    });
    expect(chart.westernHouse).toBeGreaterThanOrEqual(1);
    expect(chart.westernHouse).toBeLessThanOrEqual(12);
    expect(chart.vedicHouse).toBeGreaterThanOrEqual(1);
    expect(chart.vedicHouse).toBeLessThanOrEqual(12);
  });

  test("nakshatra pada is always within 1-4", () => {
    const chart = computeVenusChart({
      y: 1985, mo: 12, d: 25, hh: 6, mm: 0,
      lat: 40.7128, lon: -74.006, tzOffsetHrs: -5,
    });
    expect(chart.pada).toBeGreaterThanOrEqual(1);
    expect(chart.pada).toBeLessThanOrEqual(4);
  });

  test("detects a known Venus retrograde window (Aug 2023)", () => {
    const chart = computeVenusChart({
      y: 2023, mo: 8, d: 1, hh: 0, mm: 0,
      lat: 0, lon: 0, tzOffsetHrs: 0,
    });
    expect(chart.retrograde).toBe(true);
  });

  test("detects direct motion outside a retrograde window (Jan 2024)", () => {
    const chart = computeVenusChart({
      y: 2024, mo: 1, d: 1, hh: 0, mm: 0,
      lat: 0, lon: 0, tzOffsetHrs: 0,
    });
    expect(chart.retrograde).toBe(false);
  });
});

describe("signIndex", () => {
  test("wraps correctly at sign boundaries", () => {
    expect(signIndex(0)).toBe(0);
    expect(signIndex(29.999)).toBe(0);
    expect(signIndex(30)).toBe(1);
    expect(signIndex(359.999)).toBe(11);
    expect(signIndex(360)).toBe(0);
    expect(signIndex(-1)).toBe(11);
  });
});

describe("angDiff", () => {
  test("computes the shortest angular distance", () => {
    expect(angDiff(10, 350)).toBeCloseTo(20);
    expect(angDiff(0, 180)).toBeCloseTo(180);
    expect(angDiff(45, 50)).toBeCloseTo(5);
  });
});
