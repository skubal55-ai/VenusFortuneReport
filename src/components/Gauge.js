import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function Gauge({ score }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Overall Venus Strength</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${score}%` }]} />
      </View>
      <Text style={styles.scoreText}>{score} / 100</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { fontSize: 11, color: "#7a6f63", textTransform: "uppercase", letterSpacing: 0.5 },
  barBg: { height: 12, borderRadius: 6, backgroundColor: "#eee2cf", overflow: "hidden", marginTop: 6 },
  barFill: { height: "100%", backgroundColor: "#c76b8a" },
  scoreText: { fontSize: 12, color: "#7a6f63", marginTop: 4, textAlign: "right" },
});
