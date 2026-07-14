import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { signIn, signUp } from "../services/auth";
import { fetchProfile } from "../services/profile";
import { showAlert } from "../utils/alert";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen({ navigation, route }) {
  const { birthData } = route.params;
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin"); // or "signup"
  const [busy, setBusy] = useState(false);

  async function proceedAfterAuth() {
    // fetchProfile() calls the get-profile Edge Function, which also lazily
    // creates the Supabase row on first login/signup (see
    // supabase/functions/get-profile) — so this is safe to call immediately.
    const profile = await fetchProfile();
    await refreshProfile();
    if (profile?.isAdmin || (profile?.credits ?? 0) > 0) {
      navigation.replace("Report", { birthData });
    } else {
      navigation.replace("Payment", { birthData });
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password) {
      showAlert("Missing details", "Enter both email and password.");
      return;
    }
    setBusy(true);
    try {
      mode === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
      await proceedAfterAuth();
    } catch (e) {
      showAlert("Authentication error", e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === "signin" ? "Log In" : "Create Account"}</Text>
      <Text style={styles.subtitle}>Log in to generate and unlock your Venus Report.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.primaryBtnText}>{mode === "signin" ? "Log In" : "Sign Up"}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
        <Text style={styles.switchText}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Log in"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ec", padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: "#c76b8a", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#7a6f63", marginBottom: 24, marginTop: 6 },
  input: {
    borderWidth: 1, borderColor: "#e7d9c4", borderRadius: 8, padding: 12,
    backgroundColor: "#fff", fontSize: 15, marginBottom: 12,
  },
  primaryBtn: { marginTop: 8, backgroundColor: "#c76b8a", borderRadius: 8, padding: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  switchText: { textAlign: "center", color: "#b8860b", marginTop: 16 },
});
