import { NextResponse } from "next/server";
import { runSingleCardFetch } from "@/lib/fetch-runner";
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

/** POST — fetch bill for one card from BillDesk */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const householdId = await resolveHouseholdId();
    const outcome = await runSingleCardFetch(id, { householdId });

    if (outcome.status === "FAILED") {
      return NextResponse.json(
        { ok: false, outcome },
        { status: outcome.error === "Card not found" ? 404 : 422 }
      );
    }

    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 }
    );
  }
}

export const maxDuration = 60;
