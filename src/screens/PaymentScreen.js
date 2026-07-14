import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useStripe } from "@stripe/stripe-react-native";
import { computePricing as computePricingLocal } from "../services/pricing";
import { payWithRazorpay, createStripeIntent, confirmStripePayment, fetchPricing } from "../services/payments";
import { useAuth } from "../context/AuthContext";
import { showAlert } from "../utils/alert";
import AccountBar from "../components/AccountBar";

export default function PaymentScreen({ navigation, route }) {
  const { birthData } = route.params;
  const { user, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState(() => computePricingLocal(birthData.countryCode)); // instant local estimate
  const [pricingSource, setPricingSource] = useState("local"); // "local" | "server"
  const stripe = useStripe();

  useEffect(() => {
    // Confirm with the server so what's shown always matches what will be
    // charged (the server is the only one that decides the real amount).
    let cancelled = false;
    fetchPricing(birthData.countryCode)
      .then((serverPricing) => {
        if (!cancelled) {
          setPricing(serverPricing);
          setPricingSource("server");
        }
      })
      .catch(() => {
        // Keep the local estimate if the server call fails (e.g. offline);
        // the server will still be the final authority at charge time.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birthData.countryCode]);

  async function handlePay() {
    setBusy(true);
    try {
      if (pricing.gateway === "razorpay") {
        const result = await payWithRazorpay({
          countryCode: birthData.countryCode,
          name: birthData.name || "Venus Report Customer",
          email: user.email,
        });
        if (result.success) {
          await refreshProfile();
          navigation.replace("Report", { birthData });
        } else {
          showAlert("Payment could not be verified", "Please try again or contact support.");
        }
      } else {
        const { clientSecret } = await createStripeIntent({ countryCode: birthData.countryCode });
        const initResult = await stripe.initPaymentSheet({
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: "Venus Report",
        });
        if (initResult.error) throw new Error(initResult.error.message);

        const presentResult = await stripe.presentPaymentSheet();
        if (presentResult.error) {
          if (presentResult.error.code !== "Canceled") {
            showAlert("Payment failed", presentResult.error.message);
          }
          return;
        }
        // Client says success — server re-verifies with Stripe before granting credit.
        const paymentIntentId = clientSecret.split("_secret")[0];
        const verify = await confirmStripePayment({ paymentIntentId });
        if (verify.success) {
          await refreshProfile();
          navigation.replace("Report", { birthData });
        } else {
          showAlert("Payment could not be verified", "Please try again or contact support.");
        }
      }
    } catch (e) {
      showAlert("Payment error", e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <AccountBar navigation={navigation} />
      <Text style={styles.title}>Unlock Your Venus Report</Text>
      <Text style={styles.subtitle}>
        A one-time payment unlocks your full report (detailed analysis + remedies) and enables PDF download.
      </Text>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>{pricing.name || birthData.countryCode}</Text>

        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Base amount</Text>
          <Text style={styles.breakdownValue}>{pricing.symbol}{pricing.base.toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{pricing.taxLabel} ({Math.round((pricing.taxRate ?? 0) * 100)}%)</Text>
          <Text style={styles.breakdownValue}>{pricing.symbol}{pricing.taxAmount.toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.breakdownRow}>
          <Text style={styles.totalLabel}>Total payable</Text>
          <Text style={styles.priceAmount}>{pricing.symbol}{pricing.total.toFixed(2)} {pricing.currency}</Text>
        </View>

        {pricingSource === "local" && (
          <Text style={styles.syncingNote}>Confirming exact price with server...</Text>
        )}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={handlePay} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.primaryBtnText}>
            Pay {pricing.symbol}{pricing.total.toFixed(2)} via {pricing.gateway === "razorpay" ? "Razorpay" : "Card (Stripe)"}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        Your report is shown on screen and becomes downloadable only after payment is confirmed. The amount charged
        (including tax) is always confirmed by our server at the moment of payment -- this screen is a preview.
        Payments are processed securely by {pricing.gateway === "razorpay" ? "Razorpay" : "Stripe"}; this app never
        stores your card details. Tax rates shown are standard defaults and may not reflect your exact local
        obligation in every case.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ec", padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", color: "#c76b8a", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#7a6f63", marginTop: 8, marginBottom: 20, lineHeight: 20 },
  priceCard: {
    backgroundColor: "#f6e4ea", borderRadius: 12, padding: 20, marginBottom: 24,
  },
  priceLabel: { fontSize: 13, color: "#7a6f63", textAlign: "center", marginBottom: 10 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  breakdownLabel: { fontSize: 13, color: "#7a6f63" },
  breakdownValue: { fontSize: 13, color: "#2b2320", fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#e7d9c4", marginVertical: 8 },
  totalLabel: { fontSize: 14, color: "#2b2320", fontWeight: "bold" },
  priceAmount: { fontSize: 22, fontWeight: "bold", color: "#2b2320" },
  syncingNote: { fontSize: 10.5, color: "#b8860b", textAlign: "center", marginTop: 8, fontStyle: "italic" },
  primaryBtn: { backgroundColor: "#c76b8a", borderRadius: 8, padding: 16, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  disclaimer: { fontSize: 11, color: "#7a6f63", marginTop: 20, textAlign: "center", lineHeight: 16 },
});
