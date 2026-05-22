import { NextResponse } from "next/server";
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

/** Latest fetch_log row per card (for no-due / status display) */
export async function GET() {
  try {
    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();

    const { data: cards, error: cErr } = await supabase
      .from("cards")
      .select("id")
      .eq("household_id", householdId)
      .eq("active", true);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const cardIds = (cards ?? []).map((c) => c.id);
    if (cardIds.length === 0) {
      return NextResponse.json({ latestByCard: {} });
    }

    const { data: logs, error: lErr } = await supabase
      .from("fetch_log")
      .select("card_id, status, amount, error, fetched_at")
      .in("card_id", cardIds)
      .order("fetched_at", { ascending: false });

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    const latestByCard: Record<
      string,
      {
        status: string;
        amount: number;
        error: string | null;
        fetched_at: string;
      }
    > = {};

    for (const row of logs ?? []) {
      if (!row.card_id || latestByCard[row.card_id]) continue;
      latestByCard[row.card_id] = {
        status: row.status,
        amount: row.amount ?? 0,
        error: row.error ?? null,
        fetched_at: row.fetched_at,
      };
    }

    return NextResponse.json({ latestByCard });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
