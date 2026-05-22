import type { SupabaseClient } from "@supabase/supabase-js";

/** Cards select with profile join; falls back if migration not applied yet */
export async function selectCardsWithProfiles(
  supabase: SupabaseClient,
  householdId: string,
  activeOnly = true
) {
  let query = supabase
    .from("cards")
    .select("*, card_profiles(id, name)")
    .eq("household_id", householdId)
    .order("nickname");

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (
    !error ||
    (!error.message.includes("card_profiles") &&
      !error.message.includes("profile_id"))
  ) {
    return { data, error };
  }

  let fallback = supabase
    .from("cards")
    .select("*")
    .eq("household_id", householdId)
    .order("nickname");
  if (activeOnly) fallback = fallback.eq("active", true);
  return fallback;
}
