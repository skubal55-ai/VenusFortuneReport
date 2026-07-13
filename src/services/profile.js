// Replaces reading a Firestore user document. Both of these hit Supabase
// Edge Functions that verify the caller's Firebase ID token before touching
// Postgres — see supabase/functions/get-profile and
// supabase/functions/unlock-report.
import { callSupabaseFunction } from "./supabaseFunctions";

/**
 * @returns {Promise<{email: string, isAdmin: boolean, credits: number}>}
 */
export async function fetchProfile() {
  return callSupabaseFunction("get-profile", {});
}

/**
 * Atomically consumes one credit (or passes free for the admin account).
 * Call this right before showing the Report screen.
 * @returns {Promise<{allowed: boolean}>}
 */
export async function unlockReport() {
  return callSupabaseFunction("unlock-report", {});
}
