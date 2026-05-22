import "./tls-dev";
import { createClient } from "@supabase/supabase-js";

/** Service role for batch fetch; falls back to anon when SKIP_AUTH + dev RLS policies. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase API key (anon or service_role)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
