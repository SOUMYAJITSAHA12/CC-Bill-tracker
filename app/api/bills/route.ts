import { NextResponse } from "next/server";
import { getAppSupabase } from "@/lib/db";

async function selectBills(supabase: Awaited<ReturnType<typeof getAppSupabase>>, cardIds: string[]) {
  const withProfile = await supabase
    .from("bills")
    .select("*, cards(nickname, bank, last4, profile_id, card_profiles(name))")
    .in("card_id", cardIds)
    .order("due_date", { ascending: true });

  if (
    !withProfile.error ||
    (!withProfile.error.message.includes("card_profiles") &&
      !withProfile.error.message.includes("profile_id"))
  ) {
    return withProfile;
  }

  return supabase
    .from("bills")
    .select("*, cards(nickname, bank, last4)")
    .in("card_id", cardIds)
    .order("due_date", { ascending: true });
}
import { getHouseholdId, isAuthSkipped, ensureHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

async function resolveHouseholdId(): Promise<string> {
  if (isAuthSkipped()) return getHouseholdId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return ensureHousehold(user.id);
}

export async function GET() {
  try {
    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();
    const { data: cardRows } = await supabase
      .from("cards")
      .select("id")
      .eq("household_id", householdId)
      .eq("active", true);

    const cardIds = (cardRows ?? []).map((c) => c.id);
    if (cardIds.length === 0) {
      return NextResponse.json({ bills: [] });
    }

    const { data, error } = await selectBills(supabase, cardIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bills: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
