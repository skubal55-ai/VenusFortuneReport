import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { unlockReport } from "../services/profile";
import { useAuth } from "../context/AuthContext";
import {
  computeVenusChart, SIGN_SYMBOL, SIGNS, signIndex, computeCurrentVenusTransit,
  computeVimshottariDasha, computeAntardashas, findCurrentPeriod, computeMonthlyForecast,
} from "../astro/calculations";
import {
  WESTERN_DETAIL, VEDIC_DETAIL, HOUSE_WESTERN, HOUSE_VEDIC,
  REMEDY_DAILY, REMEDY_WEEKLY, REMEDY_SADHANA_16_FRIDAY, REMEDY_GEMSTONE,
  REMEDY_WEALTH, REMEDY_HEALTH, REMEDY_MODERN, REMEDY_REIKI, buildTargetedRemedies,
  LUCKY_POINTERS, CAREER_PATHS, COMPATIBLE_SIGNS, YANTRA, buildExecutiveSummary,
  buildOpeningLetter, METHODOLOGY_FAQ,
} from "../astro/content";
import Gauge from "../components/Gauge";
import Tag from "../components/Tag";
import AccountBar from "../components/AccountBar";
import VedicChart from "../components/VedicChart";
import { showAlert } from "../utils/alert";

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatYearMonth(date) {
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export default function ReportScreen({ route, navigation }) {
  const { birthData } = route.params;
  const { user, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState("checking"); // checking | allowed | denied | error
  const [errorMsg, setErrorMsg] = useState("");
  const printableRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const resp = await unlockReport();
        if (resp?.allowed) {
          await refreshProfile();
          setStatus("allowed");
        } else {
          setStatus("denied");
        }
      } catch (e) {
        setErrorMsg(e.message || String(e));
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chart = useMemo(() => computeVenusChart(birthData), [birthData]);
  // These two must stay above the early returns below: hooks have to run in
  // the same order/count on every render, but status starts as "checking"
  // and only reaches "allowed" on a later render, so if these lived after
  // the early returns they'd be skipped on that first render and then
  // called on the next one -- that mismatch is what threw "Rendered more
  // hooks than during the previous render."
  const dasha = useMemo(() => computeVimshottariDasha(birthData), [birthData]);
  const monthlyForecast = useMemo(() => computeMonthlyForecast(chart.westernSign), [chart.westernSign]);

  if (status === "checking") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#c76b8a" />
        <Text style={{ marginTop: 12, color: "#7a6f63" }}>Confirming access to your report…</Text>
      </View>
    );
  }
  if (status === "denied") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Payment Required</Text>
        <Text style={{ color: "#7a6f63", textAlign: "center", marginTop: 8 }}>
          We couldn't confirm a valid payment or credit for this report yet. Please go back and complete payment.
        </Text>
      </View>
    );
  }
  if (status === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={{ color: "#7a6f63", textAlign: "center", marginTop: 8 }}>{errorMsg}</Text>
      </View>
    );
  }

  const western = WESTERN_DETAIL[chart.westernSign];
  const vedic = VEDIC_DETAIL[chart.vedicSign];
  const targetedRemedies = buildTargetedRemedies(chart);
  const executiveSummary = buildExecutiveSummary(birthData, chart);
  const openingLetter = buildOpeningLetter(birthData);
  const transit = computeCurrentVenusTransit(chart.westernSign);
  const lucky = LUCKY_POINTERS[chart.westernSign];
  const career = CAREER_PATHS[chart.westernSign];
  const compatible = COMPATIBLE_SIGNS[chart.westernSign] || [];

  const ascSignIdx = signIndex(chart.ascSidereal);
  const venusSignIdx = signIndex(chart.venusLonSidereal);

  const currentMahadasha = findCurrentPeriod(dasha.mahadashas);
  const antardashas = computeAntardashas(currentMahadasha);
  const currentAntardasha = findCurrentPeriod(antardashas, new Date(), "start", "end");

  async function handleDownloadPdf() {
    const html = buildReportHtml(birthData, chart, western, vedic, {
      executiveSummary, openingLetter, lucky, career, compatible, transit, targetedRemedies,
      ascSignIdx, venusSignIdx, dasha, currentMahadasha, antardashas, currentAntardasha, monthlyForecast,
    });
    try {
      if (Platform.OS === "web") {
        // expo-print's printToFileAsync has no web implementation (there's no
        // app-private filesystem in a browser to write to) -- that was the
        // original crash. Its printAsync() *is* supported on web, but it
        // prints from a constrained iframe, which clipped output to a single
        // screen's worth of content instead of paginating the full report.
        // Opening the HTML in its own real browser tab and printing that
        // avoids the iframe entirely, so the browser's print engine
        // paginates the whole document normally across multiple pages.
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          showAlert("Pop-up blocked", "Please allow pop-ups for this site, then click Download again.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        let printed = false;
        const doPrint = () => {
          if (printed) return;
          printed = true;
          printWindow.focus();
          printWindow.print();
        };
        printWindow.onload = doPrint;
        // Fallback: some browsers don't reliably fire onload after
        // document.write(), so also trigger after a short delay.
        setTimeout(doPrint, 400);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      } else {
        showAlert("PDF created", `Saved to: ${uri}`);
      }
    } catch (e) {
      showAlert("Could not create PDF", e.message || String(e));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <AccountBar navigation={navigation} />
      <Text style={styles.reportName}>{birthData.name ? `${birthData.name}'s Venus Report` : "Your Venus Report"}</Text>
      <Text style={styles.reportMeta}>
        Born {birthData.y}-{String(birthData.mo).padStart(2, "0")}-{String(birthData.d).padStart(2, "0")} at{" "}
        {String(birthData.hh).padStart(2, "0")}:{String(birthData.mm).padStart(2, "0")}
        {birthData.place ? ` in ${birthData.place}` : ""}
      </Text>

      <View style={styles.card}>
        <Text style={[styles.paragraph, { fontStyle: "italic" }]}>{openingLetter}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.paragraph}>{executiveSummary}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Venus Snapshot</Text>
        <View style={styles.snapshotGrid}>
          <Stat k="Western Sign" v={`${SIGN_SYMBOL[SIGNS.indexOf(chart.westernSign)]} ${chart.westernSign}`} />
          <Stat k="Vedic Rashi" v={`${SIGN_SYMBOL[SIGNS.indexOf(chart.vedicSign)]} ${chart.vedicSign}`} />
          <Stat k="Nakshatra" v={`${chart.nakshatra} · Pada ${chart.pada}`} />
          <Stat k="Western House" v={`${ordinal(chart.westernHouse)} House`} />
          <Stat k="Vedic Bhava" v={`${ordinal(chart.vedicHouse)} Bhava`} />
          <Stat k="Dignity" v={chart.dignity.label} />
        </View>
        <Gauge score={chart.score} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          <Tag tone={chart.dignity.tone}>{chart.dignity.note}</Tag>
          <Tag tone={chart.retrograde ? "warn" : "good"}>
            {chart.retrograde ? "Retrograde — revisit & refine rather than start fresh" : "Direct motion — steady progress"}
          </Tag>
          <Tag tone={chart.combust ? "warn" : "good"}>
            {chart.combust ? `Combust (${chart.combustDiff.toFixed(1)}° from Sun)` : "Not combust"}
          </Tag>
        </View>
        <Text style={styles.subhead}>Lucky Pointers</Text>
        <View style={styles.snapshotGrid}>
          <Stat k="Lucky Day" v={lucky.day} />
          <Stat k="Lucky Colors" v={lucky.colors} />
          <Stat k="Lucky Numbers" v={lucky.numbers} />
          <Stat k="Favorable Direction" v={lucky.direction} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your Vedic Birth Chart (Rashi)</Text>
        <VedicChart ascendantSignIdx={ascSignIdx} venusSignIdx={venusSignIdx} title={birthData.name || "Rashi Chart"} />
        <Text style={styles.disclaimer}>
          South Indian style chart: sign positions are fixed and never rotate. Only your Ascendant and Venus are
          marked here, since this report focuses on Venus rather than a full nine-planet chart.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Western View — {chart.westernSign}</Text>
        <Text style={styles.paragraph}>{western.summary}</Text>
        <Text style={styles.subhead}>Love</Text>
        <Text style={styles.paragraph}>{western.love}</Text>
        <Text style={styles.subhead}>Wealth</Text>
        <Text style={styles.paragraph}>{western.wealth}</Text>
        <Text style={styles.subhead}>Health</Text>
        <Text style={styles.paragraph}>{western.health}</Text>
        <Text style={styles.subhead}>House Placement</Text>
        <Text style={styles.paragraph}>{HOUSE_WESTERN[chart.westernHouse]}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vedic View — Shukra in {chart.vedicSign}</Text>
        <Text style={styles.paragraph}>{vedic.summary}</Text>
        <Text style={styles.subhead}>Love</Text>
        <Text style={styles.paragraph}>{vedic.love}</Text>
        <Text style={styles.subhead}>Wealth</Text>
        <Text style={styles.paragraph}>{vedic.wealth}</Text>
        <Text style={styles.subhead}>Health</Text>
        <Text style={styles.paragraph}>{vedic.health}</Text>
        <Text style={styles.subhead}>Bhava Placement</Text>
        <Text style={styles.paragraph}>{HOUSE_VEDIC[chart.vedicHouse]}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Career & Compatibility</Text>
        <Text style={styles.subhead}>Career & Life Path</Text>
        <Text style={styles.paragraph}>{career}</Text>
        <Text style={styles.subhead}>Compatible Signs</Text>
        <Text style={styles.paragraph}>{compatible.join(", ")}</Text>
        <Text style={styles.disclaimer}>
          Compatibility here reflects classical sign-pairing tendencies only -- a full compatibility reading
          compares two complete charts, not just Venus signs.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Venus Right Now</Text>
        <Text style={styles.paragraph}>
          Transiting Venus is currently in {transit.currentSign}. Compared to your natal Venus in {transit.natalSign}, that makes
          this a "{transit.label}" stretch.
        </Text>
        <Text style={styles.paragraph}>{transit.note}</Text>
        <Text style={styles.disclaimer}>
          This is a general seasonal indicator based on sign-to-sign angles, not a precise prediction -- a full
          transit or dasha reading from a qualified astrologer accounts for far more detail than this alone.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your Vimshottari Dasha (Planetary Periods)</Text>
        <Text style={styles.paragraph}>
          Derived from the Moon's nakshatra at birth ({dasha.moonNakshatra}, pada {dasha.moonNakshatraPada}, in {dasha.moonSignSidereal}).
          This is the traditional Vedic system for timing life periods -- each Mahadasha below is a multi-year period ruled by one planet.
        </Text>
        <Text style={styles.subhead}>Mahadasha Timeline</Text>
        {dasha.mahadashas.map((md, i) => {
          const isCurrent = md === currentMahadasha;
          return (
            <View key={i} style={[styles.dashaRow, isCurrent && styles.dashaRowActive]}>
              <Text style={[styles.dashaPlanet, isCurrent && styles.dashaActiveText]}>
                {isCurrent ? "▶ " : ""}{md.planet}
              </Text>
              <Text style={[styles.dashaDates, isCurrent && styles.dashaActiveText]}>
                {formatYearMonth(md.displayStart)} – {formatYearMonth(md.displayEnd)}
              </Text>
            </View>
          );
        })}
        <Text style={styles.subhead}>Current Antardasha (Sub-Period): {currentMahadasha.planet} / {currentAntardasha.planet}</Text>
        {antardashas.map((ad, i) => {
          const isCurrent = ad === currentAntardasha;
          return (
            <View key={i} style={[styles.dashaRow, isCurrent && styles.dashaRowActive]}>
              <Text style={[styles.dashaPlanet, isCurrent && styles.dashaActiveText]}>
                {isCurrent ? "▶ " : ""}{currentMahadasha.planet} / {ad.planet}
              </Text>
              <Text style={[styles.dashaDates, isCurrent && styles.dashaActiveText]}>
                {formatYearMonth(ad.start)} – {formatYearMonth(ad.end)}
              </Text>
            </View>
          );
        })}
        <Text style={styles.disclaimer}>
          Dates are computed from the standard Vimshottari algorithm and a linear ayanamsa approximation --
          accurate for practical purposes, but a professional astrologer's dasha reading may refine exact
          transition dates by a small margin.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>12-Month Forward Outlook</Text>
        <Text style={styles.paragraph}>
          How transiting Venus relates to your natal Venus over the coming year, month by month.
        </Text>
        {monthlyForecast.map((m, i) => (
          <View key={i} style={styles.monthRow}>
            <Text style={styles.monthLabel}>{m.monthLabel}</Text>
            <Text style={styles.monthDetail}>{m.currentSign} · {m.label} — {m.shortNote}</Text>
          </View>
        ))}
        <Text style={styles.disclaimer}>
          Based on transiting Venus's sign-to-sign angle to your natal Venus only, not a full multi-planet
          transit or dasha forecast.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Targeted Remedies for Your Venus Condition</Text>
        <Text style={styles.paragraph}>
          The practices below are chosen specifically for what this chart shows about Venus -- its dignity, whether
          it's combust or retrograde, and the house it occupies -- rather than being generic. Each house-based
          section pairs a traditional remedy, a practical modern equivalent, and a mantra/spiritual/Reiki practice
          specific to that house. Follow these alongside (not instead of) the universal daily/weekly practices
          further down.
        </Text>
        {targetedRemedies.map((section, i) => (
          <View key={i}>
            <Text style={styles.subhead}>{section.heading}</Text>
            {section.items.map((t, j) => <Text key={j} style={styles.bullet}>• {t}</Text>)}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Universal Remedies to Strengthen Venus</Text>

        <Text style={styles.subhead}>Daily Practice</Text>
        {REMEDY_DAILY.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>Weekly (Friday) Practice</Text>
        {REMEDY_WEEKLY.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>16-Friday Shukra Sadhana (Accelerated Protocol)</Text>
        {REMEDY_SADHANA_16_FRIDAY.map((phase, i) => (
          <Text key={i} style={styles.bullet}>
            • <Text style={{ fontWeight: "bold" }}>{phase.weeks} — {phase.focus}:</Text> {phase.detail}
          </Text>
        ))}

        <Text style={styles.subhead}>Gemstone (Use Caution)</Text>
        <Text style={styles.bullet}>• {REMEDY_GEMSTONE.primary}</Text>
        <Text style={styles.bullet}>• {REMEDY_GEMSTONE.alternative}</Text>
        <Text style={[styles.bullet, { fontStyle: "italic" }]}>• {REMEDY_GEMSTONE.caution}</Text>

        <Text style={styles.subhead}>Yantra</Text>
        <Text style={styles.bullet}>• {YANTRA.primary}</Text>
        <Text style={styles.bullet}>• {YANTRA.usage}</Text>

        <Text style={styles.subhead}>For Wealth</Text>
        {REMEDY_WEALTH.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>For Health</Text>
        {REMEDY_HEALTH.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>Modern / Western-Style Practices</Text>
        {REMEDY_MODERN.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>Reiki / Energy Healing</Text>
        {REMEDY_REIKI.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.disclaimer}>
          This report uses approximate astronomical calculations and traditional astrological interpretation. It is
          intended for reflection and spiritual guidance, not a substitute for professional medical, financial, or
          legal advice, and results from remedies are a matter of traditional belief and personal practice, not a
          guaranteed or measurable outcome. Consult a qualified astrologer before gemstone use, and a licensed
          professional for health or financial decisions.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>How This Report Was Prepared</Text>
        {METHODOLOGY_FAQ.map((item, i) => (
          <View key={i} style={{ marginBottom: 12 }}>
            <Text style={styles.subhead}>{item.q}</Text>
            <Text style={styles.paragraph}>{item.a}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your Action Plan</Text>
        <Text style={styles.paragraph}>
          If you only do three things from this report: follow the "For Your Dignity" remedy above every Friday,
          track your finances weekly using the practice under Universal Remedies, and revisit this report at the
          start of your next 16-Friday cycle to see what's shifted.
        </Text>
      </View>

      <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadPdf}>
        <Text style={styles.downloadBtnText}>Download / Share as PDF</Text>
      </TouchableOpacity>
      {profile?.isAdmin && (
        <Text style={styles.adminNote}>Admin account — report unlocked free, no payment required.</Text>
      )}
    </ScrollView>
  );
}

function Stat({ k, v }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statK}>{k}</Text>
      <Text style={styles.statV}>{v}</Text>
    </View>
  );
}

// Mirrors src/components/VedicChart.js's layout, but as a plain HTML table
// for the PDF export (which can't render React Native components).
const CHART_LAYOUT = [
  [11, 0, 1, 2],
  [10, null, null, 3],
  [9, null, null, 4],
  [8, 7, 6, 5],
];
function buildChartHtml(ascSignIdx, venusSignIdx) {
  const rows = CHART_LAYOUT.map((row) => {
    const cells = row.map((idx) => {
      if (idx === null) return `<td style="border:1px solid #c76b8a;background:#f6e4ea;"></td>`;
      const markers = [];
      if (idx === ascSignIdx) markers.push("Asc");
      if (idx === venusSignIdx) markers.push("Ve &#9792;");
      return `<td style="border:1px solid #c76b8a;padding:6px;text-align:center;font-size:11px;">`
        + `${SIGN_SYMBOL[idx]} ${SIGNS[idx].slice(0, 3)}`
        + (markers.length ? `<br/><b style="color:#c76b8a;">${markers.join(" ")}</b>` : "")
        + `</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  });
  return `<table style="border-collapse:collapse;width:280px;">${rows.join("")}</table>`;
}

function buildReportHtml(birthData, chart, western, vedic, extra) {
  const {
    executiveSummary, openingLetter, lucky, career, compatible, transit, targetedRemedies,
    ascSignIdx, venusSignIdx, dasha, currentMahadasha, antardashas, currentAntardasha, monthlyForecast,
  } = extra;

  const targetedHtml = targetedRemedies.map((section) => `
    <div class="remedy-card avoid-break">
      <h3>${section.heading}</h3>
      <ul class="remedy-list">${section.items.map((t) => `<li>${t}</li>`).join("")}</ul>
    </div>
  `).join("");

  const mahadashaRows = dasha.mahadashas.map((md) => {
    const isCurrent = md === currentMahadasha;
    return `<tr class="${isCurrent ? "current" : ""}">`
      + `<td>${isCurrent ? "&#9654; " : ""}${md.planet}</td>`
      + `<td>${formatYearMonth(md.displayStart)} &ndash; ${formatYearMonth(md.displayEnd)}</td>`
      + `</tr>`;
  }).join("");

  const antardashaRows = antardashas.map((ad) => {
    const isCurrent = ad === currentAntardasha;
    return `<tr class="${isCurrent ? "current" : ""}">`
      + `<td>${isCurrent ? "&#9654; " : ""}${currentMahadasha.planet} / ${ad.planet}</td>`
      + `<td>${formatYearMonth(ad.start)} &ndash; ${formatYearMonth(ad.end)}</td>`
      + `</tr>`;
  }).join("");

  const monthlyRows = monthlyForecast.map((m) =>
    `<tr><td>${m.monthLabel}</td><td>${m.currentSign}</td><td>${m.label}</td><td>${m.shortNote}</td></tr>`
  ).join("");

  const faqHtml = METHODOLOGY_FAQ.map((item) => `
    <div class="card avoid-break">
      <h3>${item.q}</h3>
      <p>${item.a}</p>
    </div>
  `).join("");

  const universalCard = (title, listHtml) => `
    <div class="card avoid-break">
      <h3>${title}</h3>
      ${listHtml}
    </div>
  `;

  return `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { margin: 40pt 44pt; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
          color: #2b2320;
          background: #fdf6ec;
          margin: 0;
          padding: 0;
          line-height: 1.6;
          font-size: 13px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; margin: 0; }
        p { margin: 0 0 10px; }
        a { color: #c76b8a; }

        .page-break { page-break-after: always; }
        .avoid-break { page-break-inside: avoid; }

        .cover { text-align: center; padding: 50px 20px 30px; }
        .cover-eyebrow {
          letter-spacing: 3px; font-size: 11px; color: #b8860b; text-transform: uppercase;
          font-weight: bold; margin-bottom: 14px;
        }
        .cover h1 { font-size: 30px; color: #c76b8a; margin-bottom: 8px; }
        .cover .meta { color: #7a6f63; font-size: 13px; margin-bottom: 24px; }
        .divider { height: 3px; width: 60px; background: #c76b8a; margin: 4px auto 26px; border-radius: 2px; }
        .opening-letter {
          max-width: 560px; margin: 0 auto; font-style: italic; color: #4a4038; font-size: 13.5px;
          line-height: 1.85; border-top: 1px solid #e7d9c4; border-bottom: 1px solid #e7d9c4; padding: 22px 8px;
        }

        .toc h2 { margin-bottom: 14px; }
        .toc ol { list-style: none; counter-reset: toc; padding: 0; margin: 0 auto; max-width: 480px; }
        .toc li { counter-increment: toc; padding: 8px 2px; border-bottom: 1px dashed #e7d9c4; display: flex; }
        .toc li::before { content: counter(toc) "."; color: #b8860b; font-weight: bold; width: 26px; flex-shrink: 0; }
        .toc a { text-decoration: none; color: #2b2320; }

        section { padding: 6px 40px 28px; }
        .section-title {
          font-size: 18px; color: #c76b8a; border-bottom: 2px solid #f0d9e2; padding-bottom: 8px; margin-bottom: 14px;
        }
        .section-title .num { color: #b8860b; margin-right: 6px; }
        .lead {
          font-size: 13.5px; font-style: italic; color: #4a4038; background: #fffaf3;
          border-left: 3px solid #c76b8a; padding: 12px 16px; border-radius: 0 8px 8px 0;
        }

        .stat-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 18px; }
        .stat { background: #f6e4ea; border-radius: 10px; padding: 10px 14px; width: calc(50% - 5px); }
        .stat-k { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #a06b7e; }
        .stat-v { display: block; font-size: 14px; font-weight: bold; color: #2b2320; margin-top: 2px; }

        .pill {
          display: inline-block; background: #c76b8a; color: #fff; font-size: 11px; font-weight: bold;
          padding: 3px 12px; border-radius: 20px;
        }

        .score-wrap { margin: 4px 0 6px; }
        .score-label { font-size: 12px; color: #7a6f63; margin-bottom: 5px; }
        .score-track { background: #e7d9c4; border-radius: 8px; height: 10px; overflow: hidden; }
        .score-fill { background: #c76b8a; height: 100%; border-radius: 8px; }

        table.data-table { width: 100%; border-collapse: collapse; margin: 8px 0 20px; font-size: 12px; }
        table.data-table th {
          background: #f6e4ea; color: #8a4a63; text-align: left; padding: 7px 10px; border: 1px solid #e7d9c4;
          font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        table.data-table td { padding: 7px 10px; border: 1px solid #e7d9c4; }
        table.data-table tr:nth-child(even) td { background: #fffaf3; }
        table.data-table tr.current td { background: #f6e4ea; font-weight: bold; }

        .card {
          background: #fffaf3; border: 1px solid #e7d9c4; border-radius: 10px; padding: 14px 18px; margin-bottom: 14px;
        }
        .card h3 { font-size: 14px; color: #8a4a63; margin-bottom: 8px; }
        .card p:last-child { margin-bottom: 0; }

        .remedy-card {
          border-left: 4px solid #c76b8a; background: #fffaf3; border-radius: 0 10px 10px 0;
          padding: 12px 18px; margin-bottom: 14px;
        }
        .remedy-card h3 { font-size: 14px; color: #8a4a63; margin-bottom: 8px; }
        ul.remedy-list, .card ul { margin: 0; padding-left: 18px; }
        ul.remedy-list li, .card ul li { margin-bottom: 6px; }

        .chart-wrap { text-align: center; }
        .chart-wrap table { margin: 0 auto; }
        .chart-caption { font-size: 11px; color: #7a6f63; margin-top: 8px; }

        .action-box { background: #f6e4ea; border-radius: 10px; padding: 16px 20px; font-size: 13px; }

        .disclaimer {
          font-size: 10.5px; color: #7a6f63; margin: 30px 40px 20px; border-top: 1px solid #e7d9c4; padding-top: 14px;
        }
      </style>
    </head>
    <body>
      <div class="cover page-break">
        <div class="cover-eyebrow">Venus Report</div>
        <h1>${birthData.name ? birthData.name + "'s" : "Your"} Venus Report</h1>
        <div class="divider"></div>
        <p class="meta">Born ${birthData.y}-${String(birthData.mo).padStart(2, "0")}-${String(birthData.d).padStart(2, "0")}
          at ${String(birthData.hh).padStart(2, "0")}:${String(birthData.mm).padStart(2, "0")} ${birthData.place || ""}</p>
        <p class="opening-letter">${openingLetter}</p>
        <div class="toc">
          <h2>Table of Contents</h2>
          <ol>
            <li><a href="#summary">Your Venus at a Glance</a></li>
            <li><a href="#snapshot">Snapshot</a></li>
            <li><a href="#chart">Your Vedic Birth Chart</a></li>
            <li><a href="#western">Western View</a></li>
            <li><a href="#vedic">Vedic View</a></li>
            <li><a href="#career">Career &amp; Compatibility</a></li>
            <li><a href="#transit">Venus Right Now</a></li>
            <li><a href="#dasha">Vimshottari Dasha</a></li>
            <li><a href="#forecast">12-Month Forward Outlook</a></li>
            <li><a href="#targeted">Targeted Remedies</a></li>
            <li><a href="#universal">Universal Remedies</a></li>
            <li><a href="#methodology">How This Report Was Prepared</a></li>
            <li><a href="#action">Your Action Plan</a></li>
          </ol>
        </div>
      </div>

      <section id="summary">
        <h2 class="section-title"><span class="num">1.</span>Your Venus at a Glance</h2>
        <p class="lead">${executiveSummary}</p>
      </section>

      <section id="snapshot">
        <h2 class="section-title"><span class="num">2.</span>Snapshot</h2>
        <div class="stat-grid">
          <div class="stat"><span class="stat-k">Western Sign</span><span class="stat-v">${chart.westernSign} (House ${chart.westernHouse})</span></div>
          <div class="stat"><span class="stat-k">Vedic Rashi</span><span class="stat-v">${chart.vedicSign} (Bhava ${chart.vedicHouse})</span></div>
          <div class="stat"><span class="stat-k">Nakshatra</span><span class="stat-v">${chart.nakshatra} &middot; Pada ${chart.pada}</span></div>
          <div class="stat"><span class="stat-k">Dignity</span><span class="stat-v"><span class="pill">${chart.dignity.label}</span></span></div>
          <div class="stat"><span class="stat-k">Lucky Day</span><span class="stat-v">${lucky.day}</span></div>
          <div class="stat"><span class="stat-k">Lucky Colors</span><span class="stat-v">${lucky.colors}</span></div>
          <div class="stat"><span class="stat-k">Lucky Numbers</span><span class="stat-v">${lucky.numbers}</span></div>
          <div class="stat"><span class="stat-k">Favorable Direction</span><span class="stat-v">${lucky.direction}</span></div>
        </div>
        <div class="score-wrap">
          <div class="score-label">Strength Score: ${chart.score}/100</div>
          <div class="score-track"><div class="score-fill" style="width:${chart.score}%;"></div></div>
        </div>
      </section>

      <section id="chart">
        <h2 class="section-title"><span class="num">3.</span>Your Vedic Birth Chart (Rashi)</h2>
        <div class="chart-wrap">
          ${buildChartHtml(ascSignIdx, venusSignIdx)}
          <p class="chart-caption">South Indian style chart (fixed sign positions). Asc = Ascendant, Ve = Venus.</p>
        </div>
      </section>

      <section id="western">
        <h2 class="section-title"><span class="num">4.</span>Western View</h2>
        <div class="card">
          <p>${western.summary}</p>
          <p><b>Love:</b> ${western.love}</p>
          <p><b>Wealth:</b> ${western.wealth}</p>
          <p><b>Health:</b> ${western.health}</p>
        </div>
      </section>

      <section id="vedic">
        <h2 class="section-title"><span class="num">5.</span>Vedic View</h2>
        <div class="card">
          <p>${vedic.summary}</p>
          <p><b>Love:</b> ${vedic.love}</p>
          <p><b>Wealth:</b> ${vedic.wealth}</p>
          <p><b>Health:</b> ${vedic.health}</p>
        </div>
      </section>

      <section id="career">
        <h2 class="section-title"><span class="num">6.</span>Career &amp; Compatibility</h2>
        <div class="card">
          <p><b>Career &amp; Life Path:</b> ${career}</p>
          <p><b>Compatible Signs:</b> ${compatible.join(", ")}</p>
        </div>
      </section>

      <section id="transit">
        <h2 class="section-title"><span class="num">7.</span>Venus Right Now</h2>
        <div class="card">
          <p>Transiting Venus is currently in ${transit.currentSign} &mdash; a &ldquo;${transit.label}&rdquo; stretch
          relative to your natal Venus in ${transit.natalSign}. ${transit.note}</p>
        </div>
      </section>

      <section id="dasha">
        <h2 class="section-title"><span class="num">8.</span>Your Vimshottari Dasha (Planetary Periods)</h2>
        <p>Derived from the Moon's nakshatra at birth (${dasha.moonNakshatra}, pada ${dasha.moonNakshatraPada}, in ${dasha.moonSignSidereal}).</p>
        <h3 style="font-size:13px;color:#8a4a63;margin:14px 0 6px;">Mahadasha Timeline</h3>
        <table class="data-table"><thead><tr><th>Planet</th><th>Period</th></tr></thead><tbody>${mahadashaRows}</tbody></table>
        <h3 style="font-size:13px;color:#8a4a63;margin:14px 0 6px;">Current Antardasha (Sub-Period): ${currentMahadasha.planet} / ${currentAntardasha.planet}</h3>
        <table class="data-table"><thead><tr><th>Sub-Period</th><th>Window</th></tr></thead><tbody>${antardashaRows}</tbody></table>
      </section>

      <section id="forecast">
        <h2 class="section-title"><span class="num">9.</span>12-Month Forward Outlook</h2>
        <table class="data-table">
          <thead><tr><th>Month</th><th>Venus Sign</th><th>Angle</th><th>Note</th></tr></thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </section>

      <section id="targeted">
        <h2 class="section-title"><span class="num">10.</span>Targeted Remedies for Your Venus Condition</h2>
        ${targetedHtml}
      </section>

      <section id="universal">
        <h2 class="section-title"><span class="num">11.</span>Universal Remedies to Strengthen Venus</h2>
        ${universalCard("Daily Practice", `<ul>${REMEDY_DAILY.map((t) => `<li>${t}</li>`).join("")}</ul>`)}
        ${universalCard("Weekly (Friday) Practice", `<ul>${REMEDY_WEEKLY.map((t) => `<li>${t}</li>`).join("")}</ul>`)}
        ${universalCard("16-Friday Shukra Sadhana (Accelerated Protocol)", `<ul>${REMEDY_SADHANA_16_FRIDAY.map((ph) => `<li><b>${ph.weeks} &ndash; ${ph.focus}:</b> ${ph.detail}</li>`).join("")}</ul>`)}
        ${universalCard("Gemstone (Use Caution)", `<ul><li>${REMEDY_GEMSTONE.primary}</li><li>${REMEDY_GEMSTONE.alternative}</li><li><i>${REMEDY_GEMSTONE.caution}</i></li></ul>`)}
        ${universalCard("Yantra", `<ul><li>${YANTRA.primary}</li><li>${YANTRA.usage}</li></ul>`)}
        ${universalCard("For Wealth", `<ul>${REMEDY_WEALTH.map((t) => `<li>${t}</li>`).join("")}</ul>`)}
        ${universalCard("For Health", `<ul>${REMEDY_HEALTH.map((t) => `<li>${t}</li>`).join("")}</ul>`)}
        ${universalCard("Modern / Western-Style Practices", `<ul>${REMEDY_MODERN.map((t) => `<li>${t}</li>`).join("")}</ul>`)}
        ${universalCard("Reiki / Energy Healing", `<ul>${REMEDY_REIKI.map((t) => `<li>${t}</li>`).join("")}</ul>`)}
      </section>

      <section id="methodology">
        <h2 class="section-title"><span class="num">12.</span>How This Report Was Prepared</h2>
        ${faqHtml}
      </section>

      <section id="action">
        <h2 class="section-title"><span class="num">13.</span>Your Action Plan</h2>
        <div class="action-box">
          <p style="margin:0;">If you only do three things from this report: follow the &ldquo;For Your Dignity&rdquo; remedy
          above every Friday, track your finances weekly using the practice under Universal Remedies, and revisit this
          report at the start of your next 16-Friday cycle to see what's shifted.</p>
        </div>
      </section>

      <p class="disclaimer">This report uses approximate astronomical calculations and traditional astrological interpretation.
      It is intended for reflection and spiritual guidance, not a substitute for professional medical, financial, or legal
      advice, and results from remedies are a matter of traditional belief and personal practice, not a guaranteed or
      measurable outcome. Consult a qualified astrologer before gemstone use, and a licensed professional for health or
      financial decisions. Compatibility, transit, and dasha notes are general indicators, not a substitute for a full
      personalized reading from a qualified astrologer.</p>
    </body></html>
  `;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ec" },
  centered: { flex: 1, backgroundColor: "#fdf6ec", justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "bold", color: "#c76b8a" },
  reportName: { fontSize: 22, fontWeight: "bold", color: "#2b2320" },
  reportMeta: { fontSize: 12, color: "#7a6f63", marginBottom: 16 },
  card: {
    backgroundColor: "#fffaf3", borderRadius: 14, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: "#e7d9c4",
  },
  sectionTitle: { fontSize: 17, color: "#c76b8a", fontWeight: "bold", marginBottom: 10 },
  snapshotGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  stat: { width: "48%", backgroundColor: "#f6e4ea", borderRadius: 10, padding: 10, marginBottom: 8 },
  statK: { fontSize: 10, color: "#7a6f63", textTransform: "uppercase" },
  statV: { fontSize: 14, fontWeight: "bold", color: "#2b2320", marginTop: 2 },
  subhead: { fontSize: 13, fontWeight: "bold", color: "#b8860b", marginTop: 10 },
  paragraph: { fontSize: 14, lineHeight: 20, color: "#2b2320", marginTop: 2 },
  bullet: { fontSize: 13, lineHeight: 19, color: "#2b2320", marginTop: 4 },
  disclaimer: { fontSize: 10.5, color: "#7a6f63", marginTop: 16, lineHeight: 15 },
  downloadBtn: { backgroundColor: "#b8860b", borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 8 },
  downloadBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  adminNote: { textAlign: "center", color: "#7a6f63", fontSize: 11, marginBottom: 30 },
  dashaRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: "#e7d9c4",
  },
  dashaRowActive: { backgroundColor: "#f6e4ea", borderRadius: 4 },
  dashaPlanet: { fontSize: 13, color: "#2b2320" },
  dashaDates: { fontSize: 12, color: "#7a6f63" },
  dashaActiveText: { fontWeight: "bold", color: "#c76b8a" },
  monthRow: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#e7d9c4" },
  monthLabel: { fontSize: 13, fontWeight: "bold", color: "#2b2320" },
  monthDetail: { fontSize: 12, color: "#7a6f63", marginTop: 1 },
});
