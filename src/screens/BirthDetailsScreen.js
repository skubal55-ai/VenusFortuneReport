import React, { useState } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { geocodePlace } from "../services/geocode";
import { COUNTRIES } from "../services/pricing";
import { useAuth } from "../context/AuthContext";

const TZ_OPTIONS = [];
for (let m = -720; m <= 840; m += 15) {
  const h = m / 60;
  const sign = h >= 0 ? "+" : "-";
  const abs = Math.abs(h);
  const hh = String(Math.floor(abs)).padStart(2, "0");
  const mm = String(Math.round((abs - Math.floor(abs)) * 60)).padStart(2, "0");
  TZ_OPTIONS.push({ label: `UTC${sign}${hh}:${mm}`, value: h });
}

export default function BirthDetailsScreen({ navigation }) {
  const { user, profile } = useAuth();
  const [name, setName] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD
  const [tob, setTob] = useState(""); // HH:MM 24hr
  const [place, setPlace] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [tzOffset, setTzOffset] = useState(5.5);
  const [countryCode, setCountryCode] = useState("IN");
  const [geoStatus, setGeoStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleGeocode() {
    if (!place.trim()) {
      setGeoStatus("Enter a place name first.");
      return;
    }
    setGeoStatus("Looking up coordinates...");
    try {
      const result = await geocodePlace(place);
      if (result) {
        setLat(result.lat.toFixed(4));
        setLon(result.lon.toFixed(4));
        setGeoStatus(`Found: ${result.displayName}`);
      } else {
        setGeoStatus("No match found — enter latitude/longitude manually.");
      }
    } catch (e) {
      setGeoStatus("Lookup unavailable — enter latitude/longitude manually.");
    }
  }

  function validate() {
    const dobMatch = /^\d{4}-\d{2}-\d{2}$/.test(dob);
    const tobMatch = /^\d{2}:\d{2}$/.test(tob);
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!dobMatch) return "Enter date of birth as YYYY-MM-DD.";
    if (!tobMatch) return "Enter time of birth as HH:MM (24-hour).";
    if (isNaN(latNum) || isNaN(lonNum)) return "Latitude/longitude are required (use lookup or enter manually).";
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert("Missing details", err);
      return;
    }
    const [y, mo, d] = dob.split("-").map(Number);
    const [hh, mm] = tob.split(":").map(Number);
    const birthData = {
      name, y, mo, d, hh, mm,
      lat: parseFloat(lat), lon: parseFloat(lon),
      tzOffsetHrs: tzOffset, place, countryCode,
    };

    if (!user) {
      navigation.navigate("Login", { birthData });
      return;
    }
    if (profile?.isAdmin || (profile?.credits ?? 0) > 0) {
      navigation.navigate("Report", { birthData });
    } else {
      navigation.navigate("Payment", { birthData });
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>♀ Venus Report</Text>
      <Text style={styles.subtitle}>Love · Beauty · Wealth · Health — through the lens of Venus / Shukra</Text>

      <Text style={styles.label}>Name (optional)</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Suchi" />

      <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="1990-05-15" keyboardType="numbers-and-punctuation" />

      <Text style={styles.label}>Time of Birth (24-hr, local)</Text>
      <TextInput style={styles.input} value={tob} onChangeText={setTob} placeholder="14:30" keyboardType="numbers-and-punctuation" />

      <Text style={styles.label}>Place of Birth</Text>
      <TextInput style={styles.input} value={place} onChangeText={setPlace} placeholder="e.g. Mumbai, India" />

      <TouchableOpacity style={styles.secondaryBtn} onPress={handleGeocode}>
        <Text style={styles.secondaryBtnText}>Look up coordinates from place name</Text>
      </TouchableOpacity>
      {!!geoStatus && <Text style={styles.hint}>{geoStatus}</Text>}

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Text style={styles.label}>Latitude</Text>
          <TextInput style={styles.input} value={lat} onChangeText={setLat} placeholder="19.076" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.label}>Longitude</Text>
          <TextInput style={styles.input} value={lon} onChangeText={setLon} placeholder="72.877" keyboardType="numeric" />
        </View>
      </View>

      <Text style={styles.label}>UTC Offset at birth</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={tzOffset} onValueChange={setTzOffset}>
          {TZ_OPTIONS.map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Your Country (for report pricing)</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={countryCode} onValueChange={setCountryCode}>
          {COUNTRIES.map((c) => (
            <Picker.Item
              key={c.code}
              label={`${c.name} (${c.symbol}${c.baseAmount} + ${c.taxLabel})`}
              value={c.code}
            />
          ))}
        </Picker>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={busy}>
        <Text style={styles.primaryBtnText}>Generate Venus Report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ec" },
  title: { fontSize: 28, fontWeight: "bold", color: "#c76b8a", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#7a6f63", marginBottom: 20 },
  label: { fontSize: 12, color: "#7a6f63", marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: "#e7d9c4", borderRadius: 8, padding: 10,
    backgroundColor: "#fff", fontSize: 14,
  },
  row: { flexDirection: "row", marginTop: 0 },
  pickerWrap: { borderWidth: 1, borderColor: "#e7d9c4", borderRadius: 8, backgroundColor: "#fff" },
  secondaryBtn: {
    marginTop: 10, borderWidth: 1, borderColor: "#c76b8a", borderRadius: 8,
    padding: 10, alignItems: "center",
  },
  secondaryBtnText: { color: "#c76b8a", fontWeight: "600" },
  hint: { fontSize: 11, color: "#7a6f63", marginTop: 4 },
  primaryBtn: {
    marginTop: 24, marginBottom: 40, backgroundColor: "#c76b8a", borderRadius: 8,
    padding: 14, alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
