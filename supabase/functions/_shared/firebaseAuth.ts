// Verifies a Firebase Authentication ID token without any Firebase SDK —
// Deno's runtime here has no access to Firebase's Node-oriented admin SDK,
// so this checks the token's signature directly against Google's public
// keys instead. This is the standard, well-documented way to accept
// Firebase-issued tokens in a non-Firebase backend.
//
// Set FIREBASE_PROJECT_ID as a Supabase secret (`supabase secrets set
// FIREBASE_PROJECT_ID=your-project-id`) — this is the same project ID you
// used in src/services/firebase.js (e.g. "venusfortunereport").
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export interface FirebaseIdentity {
  uid: string;
  email?: string;
}

export async function verifyFirebaseToken(authHeader: string | null): Promise<FirebaseIdentity> {
  if (!PROJECT_ID) {
    throw new Error("Server misconfigured: FIREBASE_PROJECT_ID secret is not set.");
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing Authorization: Bearer <Firebase ID token> header.");
  }
  const token = authHeader.slice("Bearer ".length);

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
    // Firebase issues the token using its own servers' clock, and this
    // function verifies it using Supabase Edge Functions' clock -- a few
    // seconds of drift between two different providers' clocks is normal,
    // but jose's default clockTolerance is 0, so even 1-2 seconds of skew
    // throws "JWT issued at future" / "JWT expired" for a perfectly valid
    // token. 60s comfortably absorbs realistic clock drift without
    // meaningfully weakening expiry enforcement (tokens are valid ~1 hour).
    clockTolerance: 60,
  });

  if (!payload.sub) {
    throw new Error("Token has no subject (uid) claim.");
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
