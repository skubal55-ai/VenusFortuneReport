// Generic caller for the Supabase Edge Functions in supabase/functions/.
// These replace what used to be Firebase Cloud Functions — same idea (a
// small server-side layer that verifies payments and enforces credits),
// just running on Supabase instead. Every authenticated call attaches the
// current Firebase ID token as a Bearer token; each Edge Function verifies
// that token itself (see supabase/functions/_shared/firebaseAuth.ts) since
// Supabase has no built-in knowledge of Firebase users.
import { auth } from "./firebase";

// Find your project ref in the Supabase dashboard URL, or Project Settings
// -> API -> Project URL. It looks like "https://abcdefghijklmno.supabase.co".
const SUPABASE_FUNCTIONS_URL = "https://rgdikumgtdomrufgbzbf.supabase.co/functions/v1";

/**
 * @param {string} name - Edge Function name, e.g. "get-pricing"
 * @param {object} body - JSON body to send
 * @param {{requireAuth?: boolean}} options - set requireAuth:false for the
 *   public get-pricing endpoint, which doesn't need a logged-in user.
 */
export async function callSupabaseFunction(name, body = {}, { requireAuth = true } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (requireAuth) {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("You must be logged in to do that.");
    }
    const idToken = await user.getIdToken();
    headers.Authorization = `Bearer ${idToken}`;
  }

  const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    throw new Error(`${name}: server returned a non-JSON response (HTTP ${resp.status}).`);
  }

  if (!resp.ok) {
    throw new Error(data?.error || `${name} failed (HTTP ${resp.status}).`);
  }
  return data;
}
