// Returns the caller's own profile (credits, isAdmin) — replaces reading a
// Firestore user document. Creates the row on first call (e.g. right after
// signup) so the UI has something to read immediately.
import { verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const identity = await verifyFirebaseToken(req.headers.get("Authorization"));
    const supabase = getSupabaseAdmin();

    const { data: user, error } = await supabase.rpc("find_or_create_user", {
      p_firebase_uid: identity.uid,
      p_email: identity.email ?? "",
    });
    if (error) return json({ error: error.message }, 500);

    return json({
      email: user.email,
      isAdmin: user.is_admin,
      credits: user.credits,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 401);
  }
});
