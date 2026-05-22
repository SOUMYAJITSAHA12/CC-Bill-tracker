import { NextResponse } from "next/server";
import { BANK_BILLER_MAP } from "@/lib/banks";
import { getAppSupabase } from "@/lib/db";
import { creditCardUpiInfo } from "@/lib/upi-vpa";
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();

    const { data: card, error } = await supabase
      .from("cards")
      .select("id, nickname, bank, mobile, last4")
      .eq("id", id)
      .eq("household_id", householdId)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const info = creditCardUpiInfo(card.bank, card.mobile, card.last4);

    if (!info) {
      return NextResponse.json(
        {
          error:
            "Card-linked UPI is only supported for Axis and ICICI (valid mobile + last4 required)",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      card_id: card.id,
      nickname: card.nickname,
      bank: card.bank,
      bank_label: BANK_BILLER_MAP[card.bank]?.name ?? card.bank,
      mobile_last4: `****${card.last4}`,
      ...info,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 }
    );
  }
}
