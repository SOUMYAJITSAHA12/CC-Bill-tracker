import { NextResponse } from "next/server";
import { billerNameForBank } from "@/lib/banks";
import { selectCardsWithProfiles } from "@/lib/cards-query";
import { getAppSupabase } from "@/lib/db";
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
    const { data, error } = await selectCardsWithProfiles(
      supabase,
      householdId,
      true
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cards: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nickname, bank, last4, mobile, profile_id, credit_limit } = body;

    if (!nickname || !bank || !last4 || !mobile) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!billerNameForBank(bank)) {
      return NextResponse.json({ error: `Unsupported bank: ${bank}` }, { status: 400 });
    }
    if (String(last4).length !== 4 || String(mobile).length < 10) {
      return NextResponse.json({ error: "Invalid last4 or mobile" }, { status: 400 });
    }

    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();
    const insert: Record<string, unknown> = {
      household_id: householdId,
      nickname,
      bank: String(bank).toLowerCase(),
      last4: String(last4),
      mobile: String(mobile),
      credit_limit: credit_limit ?? 0,
    };
    if (profile_id) insert.profile_id = profile_id;

    const { data, error } = await supabase
      .from("cards")
      .insert(insert)
      .select("*, card_profiles(id, name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ card: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
