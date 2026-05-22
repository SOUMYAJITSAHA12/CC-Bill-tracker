import { NextResponse } from "next/server";
import { billerNameForBank } from "@/lib/banks";
import { getAppSupabase } from "@/lib/db";
import { getHouseholdId, isAuthSkipped, ensureHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

async function resolveHouseholdId(): Promise<string> {
  if (isAuthSkipped()) return await getHouseholdId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return ensureHousehold(user.id);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nickname, bank, last4, mobile, profile_id } = body;

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

    const update: Record<string, unknown> = {
      nickname: String(nickname).trim(),
      bank: String(bank).toLowerCase(),
      last4: String(last4),
      mobile: String(mobile),
      profile_id: profile_id ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("cards")
      .update(update)
      .eq("id", id)
      .eq("household_id", householdId)
      .eq("active", true)
      .select("*, card_profiles(id, name)")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    return NextResponse.json({ card: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();
    const { error } = await supabase
      .from("cards")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
