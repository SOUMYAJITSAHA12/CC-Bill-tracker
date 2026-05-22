import "@/lib/supabase/tls-dev";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAuthSkipped } from "@/lib/household";

/** Admin client when auth skipped (bypasses RLS); else user-scoped client. */
export async function getAppSupabase() {
  if (isAuthSkipped()) {
    return createAdminClient();
  }
  return await createClient();
}
