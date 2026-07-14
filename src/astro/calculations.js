// Core Venus/Shukra astronomical + astrological calculations.
// Pure JS, no DOM or Node-only APIs, safe for React Native / Expo.
import * as Astronomy from "astronomy-engine";

export const SIGNS = [
  "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
];
export const SIGN_SYMBOL = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];

export const NAKSHATRAS = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha",
  "Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
  "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada",
  "Uttara Bhadrapada","Revati"
];
export const VENUS_NAKSHATRAS = ["Bharani", "Purva Phalguni", "Purva Ashadha"];

export const DIGNITY = {
  Pisces:    { label: "Exalted",                 tone: "good",    note: "Venus is exalted here — its single strongest and most auspicious placement." },
  Taurus:    { label: "Own Sign",                tone: "good",    note: "Venus rules this sign — a naturally strong, comfortable placement." },
  Libra:     { label: "Own Sign / Moolatrikona", tone: "good",    note: "Venus rules this sign and sits in Moolatrikona here — a very strong placement." },
  Virgo:     { label: "Debilitated",             tone: "warn",    note: "Venus is debilitated here — its most challenging placement, calling for extra remedies." },
  Scorpio:   { label: "Challenging Sign",         tone: "warn",   note: "Venus is uncomfortable here, often bringing intensity to love and money matters." },
  Capricorn: { label: "Challenging Sign",         tone: "warn",   note: "Venus is in a difficult sign here, favoring caution and steady effort over ease." },
};

function julianCenturiesJ2000(date) {
  const JD = date.getTime() / 86400000 + 2440587.5;
  return (JD - 2451545.0) / 36525.0;
}
function meanObliquity(date) {
  const T = julianCenturiesJ2000(date);
  return 23.4392911 - 0.0130042 * T - 0.00000016 * T * T + 0.000000504 * T * T * T;
}
function siderealTimeDeg(date) {
  return Astronomy.SiderealTime(date) * 15.0;
}
export function ascendantTropical(date, lonDeg, latDeg) {
  const gstDeg = siderealTimeDeg(date);
  const lstDeg = (gstDeg + lonDeg + 360) % 360;
  const ramc = (lstDeg * Math.PI) / 180;
  const eps = (meanObliquity(date) * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const y = -Math.cos(ramc);
  const x = Math.sin(ramc) * Math.cos(eps) + Math.tan(lat) * Math.sin(eps);
  let asc = (Math.atan2(y, x) * 180) / Math.PI;
  return (asc + 360) % 360;
}
export function venusEclipticLongitude(date) {
  const vec = Astronomy.GeoVector(Astronomy.Body.Venus, date, true);
  return Astronomy.Ecliptic(vec).elon;
}
export function sunEclipticLongitude(date) {
  return Astronomy.SunPosition(date).elon;
}
function dayOfYearFrac(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return (date.getTime() - start) / (365.25 * 86400000);
}
export function lahiriAyanamsa(date) {
  const year = date.getUTCFullYear() + dayOfYearFrac(date);
  return 23.85 + (year - 2000) * (50.2388475 / 3600);
}
export function signIndex(lon) {
  return Math.floor((((lon % 360) + 360) % 360) / 30);
}
export function angDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}
export function isRetrograde(date) {
  const l1 = venusEclipticLongitude(date);
  const l2 = venusEclipticLongitude(new Date(date.getTime() + 86400000));
  let d = l2 - l1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d < 0;
}

/**
 * Full Venus chart calculation.
 * @param {{y:number,mo:number,d:number,hh:number,mm:number,lat:number,lon:number,tzOffsetHrs:number}} birth
 */
export function computeVenusChart(birth) {
  const { y, mo, d, hh, mm, lat, lon, tzOffsetHrs } = birth;
  const utcMillis = Date.UTC(y, mo - 1, d, hh, mm) - tzOffsetHrs * 3600 * 1000;
  const utcDate = new Date(utcMillis);

  const venusLonTropical = venusEclipticLongitude(utcDate);
  const sunLon = sunEclipticLongitude(utcDate);
  const ayanamsa = lahiriAyanamsa(utcDate);
  const venusLonSidereal = ((venusLonTropical - ayanamsa) % 360 + 360) % 360;

  const ascTropical = ascendantTropical(utcDate, lon, lat);
  const ascSidereal = ((ascTropical - ayanamsa) % 360 + 360) % 360;

  const westernSignIdx = signIndex(venusLonTropical);
  const vedicSignIdx = signIndex(venusLonSidereal);
  const westernSign = SIGNS[westernSignIdx];
  const vedicSign = SIGNS[vedicSignIdx];

  const westernHouse = ((westernSignIdx - signIndex(ascTropical) + 12) % 12) + 1;
  const vedicHouse = ((vedicSignIdx - signIndex(ascSidereal) + 12) % 12) + 1;

  const nakshatraSpan = 360 / 27;
  const nakIdx = Math.floor(venusLonSidereal / nakshatraSpan);
  const nakPos = venusLonSidereal % nakshatraSpan;
  const pada = Math.floor(nakPos / (nakshatraSpan / 4)) + 1;
  const nakshatra = NAKSHATRAS[nakIdx];

  const retrograde = isRetrograde(utcDate);
  const combustDiff = angDiff(venusLonTropical, sunLon);
  const combust = combustDiff < 8;

  const dignity = DIGNITY[vedicSign] || { label: "Neutral", tone: "neutral", note: "Venus is in a neutral, workable placement here." };
  const ownNakshatra = VENUS_NAKSHATRAS.includes(nakshatra);

  let score = 55;
  if (dignity.tone === "good") score += 25;
  if (dignity.tone === "warn") score -= 20;
  if (combust) score -= 15;
  if (retrograde) score -= 5;
  if (ownNakshatra) score += 10;
  score = Math.max(5, Math.min(97, score));

  return {
    westernSign, vedicSign, westernHouse, vedicHouse,
    nakshatra, pada, retrograde, combust, combustDiff,
    dignity, ownNakshatra, score,
    venusLonTropical, venusLonSidereal, ascTropical, ascSidereal, ayanamsa,
  };
}

/**
 * Compares today's real-time Venus position against this chart's natal
 * Venus sign to give a simple, honest timing note -- the one thing every
 * commercial astrology report includes (some window of "here's what's
 * happening for you right now / soon") that a pure natal-only report
 * lacks. Uses the angular distance between current and natal sign
 * (classic aspect logic: conjunction/trine/sextile = supportive,
 * square/opposition = friction) rather than a full transit/dasha engine,
 * which is out of scope here -- framed as a general seasonal indicator,
 * not a precise prediction.
 * @param {string} natalWesternSign - chart.westernSign from computeVenusChart()
 * @param {Date} [now] - defaults to the current date/time
 */
export function computeCurrentVenusTransit(natalWesternSign, now = new Date()) {
  const currentLon = venusEclipticLongitude(now);
  const currentSignIdx = signIndex(currentLon);
  const currentSign = SIGNS[currentSignIdx];
  const natalSignIdx = SIGNS.indexOf(natalWesternSign);

  const signsApart = ((currentSignIdx - natalSignIdx + 12) % 12);

  let label, note;
  if (signsApart === 0) {
    label = "Venus Return";
    note = "Transiting Venus is currently back in your natal Venus sign -- traditionally considered a personal 'Venus return,' a favorable window (roughly a few weeks, once a year) for refreshing intentions around love, money, and self-worth.";
  } else if (signsApart === 4 || signsApart === 8) {
    label = "Supportive (Trine)";
    note = "Transiting Venus is currently in a harmonious trine to your natal Venus -- generally an easier-than-average stretch for love and money matters, worth using for follow-through rather than waiting.";
  } else if (signsApart === 3 || signsApart === 9) {
    label = "Friction (Square)";
    note = "Transiting Venus is currently square your natal Venus -- traditionally a mildly friction-prone stretch for relationships and spending; a good window to lean on the remedies above rather than force new decisions.";
  } else if (signsApart === 6) {
    label = "Tension (Opposition)";
    note = "Transiting Venus is currently opposite your natal Venus -- traditionally calls for extra balance in partnerships and finances; avoid one-sided decisions in either direction this stretch.";
  } else {
    label = "Neutral";
    note = "Transiting Venus is not in an especially strong or weak angle to your natal Venus right now -- a fairly ordinary stretch, best used for steady practice of the remedies above rather than expecting a major shift either way.";
  }

  return { currentSign, natalSign: natalWesternSign, signsApart, label, note };
}
