import { createAdminClient } from "@/lib/supabase/admin";

export function isAuthSkipped(): boolean {
  return process.env.SKIP_AUTH === "true";
}

/** Household for API routes — no login when SKIP_AUTH=true */
export async function getHouseholdId(): Promise<string> {
  if (process.env.DEV_HOUSEHOLD_ID) {
    return process.env.DEV_HOUSEHOLD_ID;
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await admin
    .from("households")
    .insert({ name: "Default Household" })
    .select("id")
    .single();

  if (error || !created) {
    throw error ?? new Error("Failed to create default household");
  }

  return created.id;
}

/** Ensure logged-in user has a household (when auth enabled).
 *
 * Bootstrap uses the admin (service role) client because the user-scoped RLS
 * has a chicken-and-egg: the SELECT policy on `households` and the ALL policy
 * on `household_members` both require the user to already be a member. On a
 * brand-new signup, `insert().select().single()` for `households` would return
 * 0 rows (RLS filters the RETURNING clause) and the whole call would throw.
 *
 * Admin client is safe here — we scope every query by `user_id` explicitly, so
 * no cross-user leakage is possible, and we only ever create resources for the
 * user we were called with. Falls back to the anon key if SERVICE_ROLE is
 * unset, which will re-hit the RLS wall for a brand-new user (unavoidable
 * without service role — a clear error is thrown in that case). */
export async function ensureHousehold(userId: string): Promise<string> {
  const admin = createAdminClient();

  // Use order+limit(1) rather than maybeSingle: if a user somehow ends up with
  // multiple household_members rows (legacy state from the pre-fix RLS loop
  // that used to create a new household on every failed request), maybeSingle
  // returns null and we'd create yet ANOTHER household. Deterministically
  // pick the earliest membership so repeated calls always resolve to the
  // same household.
  const { data: existing } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.household_id) return existing.household_id;

  const { data: household, error: hErr } = await admin
    .from("households")
    .insert({ name: "Credit Cards" })
    .select("id")
    .single();

  if (hErr || !household) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Cannot bootstrap household for new user: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local. Add it (from Supabase dashboard → Project settings → API) and restart the dev server."
      );
    }
    throw hErr ?? new Error("Failed to create household");
  }

  const { error: mErr } = await admin.from("household_members").insert({
    household_id: household.id,
    user_id: userId,
    role: "admin",
  });

  if (mErr) throw mErr;
  return household.id;
}
