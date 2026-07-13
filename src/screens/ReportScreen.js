import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { unlockReport } from "../services/profile";
import { useAuth } from "../context/AuthContext";
import { computeVenusChart, SIGN_SYMBOL, SIGNS } from "../astro/calculations";
import {
  WESTERN_DETAIL, VEDIC_DETAIL, HOUSE_WESTERN, HOUSE_VEDIC,
  REMEDY_DAILY, REMEDY_WEEKLY, REMEDY_SADHANA_16_FRIDAY, REMEDY_GEMSTONE,
  REMEDY_WEALTH, REMEDY_HEALTH, REMEDY_MODERN,
} from "../astro/content";
import Gauge from "../components/Gauge";
import Tag from "../components/Tag";

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function ReportScreen({ route }) {
  const { birthData } = route.params;
  const { profile, refreshProfile } = useAuth();
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

  async function handleDownloadPdf() {
    try {
      const html = buildReportHtml(birthData, chart, western, vedic);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      } else {
        Alert.alert("PDF created", `Saved to: ${uri}`);
      }
    } catch (e) {
      Alert.alert("Could not create PDF", e.message || String(e));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.reportName}>{birthData.name ? `${birthData.name}'s Venus Report` : "Your Venus Report"}</Text>
      <Text style={styles.reportMeta}>
        Born {birthData.y}-{String(birthData.mo).padStart(2, "0")}-{String(birthData.d).padStart(2, "0")} at{" "}
        {String(birthData.hh).padStart(2, "0")}:{String(birthData.mm).padStart(2, "0")}
        {birthData.place ? ` in ${birthData.place}` : ""}
      </Text>

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
        <Text style={styles.sectionTitle}>Remedies to Strengthen Venus</Text>

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

        <Text style={styles.subhead}>For Wealth</Text>
        {REMEDY_WEALTH.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>For Health</Text>
        {REMEDY_HEALTH.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.subhead}>Modern / Western-Style Practices</Text>
        {REMEDY_MODERN.map((t, i) => <Text key={i} style={styles.bullet}>• {t}</Text>)}

        <Text style={styles.disclaimer}>
          This report uses approximate astronomical calculations and traditional astrological interpretation. It is
          intended for reflection and spiritual guidance, not a substitute for professional medical, financial, or
          legal advice, and results from remedies are a matter of traditional belief and personal practice, not a
          guaranteed or measurable outcome. Consult a qualified astrologer before gemstone use, and a licensed
          professional for health or financial decisions.
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

function buildReportHtml(birthData, chart, western, vedic) {
  return `
    <html><body style="font-family: Georgia, serif; padding: 24px; color:#2b2320;">
      <h1 style="color:#c76b8a;">${birthData.name ? birthData.name + "'s" : "Your"} Venus Report</h1>
      <p>Born ${birthData.y}-${birthData.mo}-${birthData.d} at ${birthData.hh}:${birthData.mm} ${birthData.place || ""}</p>
      <h2>Snapshot</h2>
      <p>Western Sign: ${chart.westernSign} (House ${chart.westernHouse})<br/>
      Vedic Rashi: ${chart.vedicSign} (Bhava ${chart.vedicHouse})<br/>
      Nakshatra: ${chart.nakshatra} Pada ${chart.pada}<br/>
      Dignity: ${chart.dignity.label}<br/>
      Strength Score: ${chart.score}/100</p>
      <h2>Western View</h2>
      <p>${western.summary}</p><p><b>Love:</b> ${western.love}</p><p><b>Wealth:</b> ${western.wealth}</p><p><b>Health:</b> ${western.health}</p>
      <h2>Vedic View</h2>
      <p>${vedic.summary}</p><p><b>Love:</b> ${vedic.love}</p><p><b>Wealth:</b> ${vedic.wealth}</p><p><b>Health:</b> ${vedic.health}</p>
      <p style="font-size:11px;color:#7a6f63;margin-top:30px;">For reflection and spiritual guidance only; not a substitute for professional medical, financial, or legal advice.</p>
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
});
