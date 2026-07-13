// Firebase initialization — Authentication ONLY. Firestore and Firebase
// Cloud Functions are intentionally not used anywhere in this project:
// credits, payments, and report history live in your own Supabase Postgres
// database instead (see db/schema.sql and supabase/functions/), reached
// through plain HTTPS calls in services/supabaseFunctions.js. Firebase Auth
// stays because it's free on the Spark plan and saves you writing your own
// password/session handling — this project doesn't need Firebase's paid
// Blaze plan at all.
//
// 1. Create a free project at https://console.firebase.google.com
// 2. Enable Authentication -> Sign-in method -> Email/Password
// 3. Project settings -> General -> "Your apps" -> Web app -> copy the config below
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// Kept here only for reference/UI display — the *authoritative* admin
// check lives in Postgres (db/schema.sql's apply_admin_default trigger) and
// in every Supabase Edge Function that matters, not in this client file.
export const ADMIN_EMAIL = "skubal52@gmail.com";

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Local testing: run `firebase emulators:start` (Auth only — see README
// "Testing" section), then start the app with
// EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1 to log in against your local
// emulator instead of production Firebase.
//
// "localhost" only resolves correctly from a simulator/emulator on the same
// machine — for a physical phone on the same network, replace it with your
// computer's LAN IP address (e.g. 192.168.1.23) via EXPO_PUBLIC_EMULATOR_HOST.
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "1") {
  const HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || "localhost";
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  // eslint-disable-next-line no-console
  console.log(`[Venus Report] Using Firebase Auth emulator at ${HOST}`);
}
