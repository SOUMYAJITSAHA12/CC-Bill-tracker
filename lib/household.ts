import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

/** Ensure logged-in user has a household (when auth enabled). */
export async function ensureHousehold(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.household_id) return existing.household_id;

  const { data: household, error: hErr } = await supabase
    .from("households")
    .insert({ name: "Credit Cards" })
    .select("id")
    .single();

  if (hErr || !household) throw hErr ?? new Error("Failed to create household");

  const { error: mErr } = await supabase.from("household_members").insert({
    household_id: household.id,
    user_id: userId,
    role: "admin",
  });

  if (mErr) throw mErr;
  return household.id;
}
