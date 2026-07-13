// Server-side Supabase client using the service_role key — this key bypasses
// Row Level Security entirely, which is exactly why it must only ever be
// used here (inside Edge Functions, read from a Supabase secret) and never
// shipped to the app. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically into every Edge Function's environment by
// Supabase — you don't need to set them yourself.
import { createClient } from "npm:@supabase/supabase-js@2";

export function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
