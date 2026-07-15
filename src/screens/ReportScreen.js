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

  const dasha = useMemo(() => computeVimshottariDasha(birthData), [birthData]);
  const currentMahadasha = findCurrentPeriod(dasha.mahadashas);
  const antardashas = computeAntardashas(currentMahadasha);
  const currentAntardasha = findCurrentPeriod(antardashas, new Date(), "start", "end");
  const monthlyForecast = useMemo(() => computeMonthlyForecast(chart.westernSign), [chart.westernSign]);

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
          The practices below are chosen specifically for what this chart shows about Venus -- its dignity, and
          whether it's combust or retrograde -- rather than being generic. Follow these alongside (not instead of)
          the universal daily/weekly practices further down.
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
    <h3>${section.heading}</h3>
    <ul>${section.items.map((t) => `<li>${t}</li>`).join("")}</ul>
  `).join("");

  const mahadashaRows = dasha.mahadashas.map((md) => {
    const isCurrent = md === currentMahadasha;
    return `<tr style="${isCurrent ? "background:#f6e4ea;font-weight:bold;" : ""}">`
      + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${isCurrent ? "&#9654; " : ""}${md.planet}</td>`
      + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${formatYearMonth(md.displayStart)} - ${formatYearMonth(md.displayEnd)}</td>`
      + `</tr>`;
  }).join("");

  const antardashaRows = antardashas.map((ad) => {
    const isCurrent = ad === currentAntardasha;
    return `<tr style="${isCurrent ? "background:#f6e4ea;font-weight:bold;" : ""}">`
      + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${isCurrent ? "&#9654; " : ""}${currentMahadasha.planet} / ${ad.planet}</td>`
      + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${formatYearMonth(ad.start)} - ${formatYearMonth(ad.end)}</td>`
      + `</tr>`;
  }).join("");

  const monthlyRows = monthlyForecast.map((m) =>
    `<tr><td style="padding:4px 8px;border:1px solid #e7d9c4;">${m.monthLabel}</td>`
    + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${m.currentSign}</td>`
    + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${m.label}</td>`
    + `<td style="padding:4px 8px;border:1px solid #e7d9c4;">${m.shortNote}</td></tr>`
  ).join("");

  const faqHtml = METHODOLOGY_FAQ.map((item) => `<p><b>${item.q}</b><br/>${item.a}</p>`).join("");

  return `
    <html><body style="font-family: Georgia, serif; padding: 24px; color:#2b2320;">
      <h1 style="color:#c76b8a;">${birthData.name ? birthData.name + "'s" : "Your"} Venus Report</h1>
      <p>Born ${birthData.y}-${birthData.mo}-${birthData.d} at ${birthData.hh}:${birthData.mm} ${birthData.place || ""}</p>

      <div style="page-break-after:always;">
        <p style="font-style:italic;">${openingLetter}</p>
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

      <h2 id="summary">Your Venus at a Glance</h2>
      <p style="font-style:italic;">${executiveSummary}</p>

      <h2 id="snapshot">Snapshot</h2>
      <p>Western Sign: ${chart.westernSign} (House ${chart.westernHouse})<br/>
      Vedic Rashi: ${chart.vedicSign} (Bhava ${chart.vedicHouse})<br/>
      Nakshatra: ${chart.nakshatra} Pada ${chart.pada}<br/>
      Dignity: ${chart.dignity.label}<br/>
      Strength Score: ${chart.score}/100<br/>
      Lucky Day: ${lucky.day} | Lucky Colors: ${lucky.colors} | Lucky Numbers: ${lucky.numbers} | Favorable Direction: ${lucky.direction}</p>

      <h2 id="chart">Your Vedic Birth Chart (Rashi)</h2>
      ${buildChartHtml(ascSignIdx, venusSignIdx)}
      <p style="font-size:11px;color:#7a6f63;">South Indian style chart (fixed sign positions). Asc = Ascendant, Ve = Venus.</p>

      <h2 id="western">Western View</h2>
      <p>${western.summary}</p><p><b>Love:</b> ${western.love}</p><p><b>Wealth:</b> ${western.wealth}</p><p><b>Health:</b> ${western.health}</p>

      <h2 id="vedic">Vedic View</h2>
      <p>${vedic.summary}</p><p><b>Love:</b> ${vedic.love}</p><p><b>Wealth:</b> ${vedic.wealth}</p><p><b>Health:</b> ${vedic.health}</p>

      <h2 id="career">Career &amp; Compatibility</h2>
      <p><b>Career & Life Path:</b> ${career}</p>
      <p><b>Compatible Signs:</b> ${compatible.join(", ")}</p>

      <h2 id="transit">Venus Right Now</h2>
      <p>Transiting Venus is currently in ${transit.currentSign} -- a "${transit.label}" stretch relative to your natal Venus in ${transit.natalSign}. ${transit.note}</p>

      <h2 id="dasha">Your Vimshottari Dasha (Planetary Periods)</h2>
      <p>Derived from the Moon's nakshatra at birth (${dasha.moonNakshatra}, pada ${dasha.moonNakshatraPada}, in ${dasha.moonSignSidereal}).</p>
      <h3>Mahadasha Timeline</h3>
      <table style="border-collapse:collapse;width:100%;">${mahadashaRows}</table>
      <h3>Current Antardasha (Sub-Period): ${currentMahadasha.planet} / ${currentAntardasha.planet}</h3>
      <table style="border-collapse:collapse;width:100%;">${antardashaRows}</table>

      <h2 id="forecast">12-Month Forward Outlook</h2>
      <table style="border-collapse:collapse;width:100%;">
        <tr><th style="padding:4px 8px;border:1px solid #e7d9c4;text-align:left;">Month</th><th style="padding:4px 8px;border:1px solid #e7d9c4;text-align:left;">Venus Sign</th><th style="padding:4px 8px;border:1px solid #e7d9c4;text-align:left;">Angle</th><th style="padding:4px 8px;border:1px solid #e7d9c4;text-align:left;">Note</th></tr>
        ${monthlyRows}
      </table>

      <h2 id="targeted">Targeted Remedies for Your Venus Condition</h2>
      ${targetedHtml}

      <h2 id="universal">Universal Remedies to Strengthen Venus</h2>
      <h3>Daily Practice</h3>
      <ul>${REMEDY_DAILY.map((t) => `<li>${t}</li>`).join("")}</ul>
      <h3>Weekly (Friday) Practice</h3>
      <ul>${REMEDY_WEEKLY.map((t) => `<li>${t}</li>`).join("")}</ul>
      <h3>16-Friday Shukra Sadhana (Accelerated Protocol)</h3>
      <ul>${REMEDY_SADHANA_16_FRIDAY.map((ph) => `<li><b>${ph.weeks} -- ${ph.focus}:</b> ${ph.detail}</li>`).join("")}</ul>
      <h3>Gemstone (Use Caution)</h3>
      <ul><li>${REMEDY_GEMSTONE.primary}</li><li>${REMEDY_GEMSTONE.alternative}</li><li><i>${REMEDY_GEMSTONE.caution}</i></li></ul>
      <h3>Yantra</h3>
      <ul><li>${YANTRA.primary}</li><li>${YANTRA.usage}</li></ul>
      <h3>For Wealth</h3>
      <ul>${REMEDY_WEALTH.map((t) => `<li>${t}</li>`).join("")}</ul>
      <h3>For Health</h3>
      <ul>${REMEDY_HEALTH.map((t) => `<li>${t}</li>`).join("")}</ul>
      <h3>Modern / Western-Style Practices</h3>
      <ul>${REMEDY_MODERN.map((t) => `<li>${t}</li>`).join("")}</ul>
      <h3>Reiki / Energy Healing</h3>
      <ul>${REMEDY_REIKI.map((t) => `<li>${t}</li>`).join("")}</ul>

      <h2 id="methodology">How This Report Was Prepared</h2>
      ${faqHtml}

      <h2 id="action">Your Action Plan</h2>
      <p>If you only do three things from this report: follow the "For Your Dignity" remedy above every Friday, track your finances weekly using the practice under Universal Remedies, and revisit this report at the start of your next 16-Friday cycle to see what's shifted.</p>

      <p style="font-size:11px;color:#7a6f63;margin-top:30px;">This report uses approximate astronomical calculations and traditional astrological interpretation. It is intended for reflection and spiritual guidance, not a substitute for professional medical, financial, or legal advice, and results from remedies are a matter of traditional belief and personal practice, not a guaranteed or measurable outcome. Consult a qualified astrologer before gemstone use, and a licensed professional for health or financial decisions. Compatibility, transit, and dasha notes are general indicators, not a substitute for a full personalized reading from a qualified astrologer.</p>
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
