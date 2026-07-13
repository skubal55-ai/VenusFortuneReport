// Called right before showing the Report screen. Atomically checks and
// consumes one credit (or passes free for the admin account) via the
// unlock_report() Postgres function, which locks the row for the duration
// of the check so two simultaneous requests can't both succeed off a
// single remaining credit.
import { verifyFirebaseToken } from "../_shared/firebaseAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const identity = await verifyFirebaseToken(req.headers.get("Authorization"));
    const supabase = getSupabaseAdmin();

    // Ensure the row exists (covers a user whose very first API call is
    // this one, e.g. they already had credits granted... in practice this
    // is mostly a safety net, find_or_create_user runs on every payment
    // call too).
    await supabase.rpc("find_or_create_user", {
      p_firebase_uid: identity.uid,
      p_email: identity.email ?? "",
    });

    const { data: allowed, error } = await supabase.rpc("unlock_report", {
      p_firebase_uid: identity.uid,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ allowed: !!allowed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 401);
  }
});
