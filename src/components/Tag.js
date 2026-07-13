import React from "react";
import { View, Text, StyleSheet } from "react-native";

const TONE_STYLES = {
  good: { backgroundColor: "#e6f4ea", color: "#2e7d47" },
  warn: { backgroundColor: "#fdecea", color: "#b3453a" },
  neutral: { backgroundColor: "#eef0f4", color: "#555" },
};

export default function Tag({ tone = "neutral", children }) {
  const t = TONE_STYLES[tone] || TONE_STYLES.neutral;
  return (
    <View style={[styles.tag, { backgroundColor: t.backgroundColor }]}>
      <Text style={[styles.text, { color: t.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, marginRight: 6, marginBottom: 6 },
  text: { fontSize: 11 },
});
