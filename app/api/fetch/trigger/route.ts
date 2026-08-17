import { NextResponse } from "next/server";
import { runBatchFetch } from "@/lib/fetch-runner";
import { ensureHousehold, getHouseholdId, isAuthSkipped } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

/**
 * User-facing "fetch all bills" endpoint (synchronous, no streaming).
 *
 * Previously proxied to /api/fetch/run using FETCH_CRON_SECRET, which fetched
 * every card across every household — a multi-tenant leak. Now scopes the run
 * to the caller's household. The cron endpoint (/api/fetch/run) stays as-is
 * for the GitHub Actions batch worker that legitimately needs global scope.
 */
export async function POST() {
  try {
    let householdId: string;
    if (isAuthSkipped()) {
      householdId = await getHouseholdId();
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      householdId = await ensureHousehold(user.id);
    }

    const summary = await runBatchFetch({ householdId });
    return NextResponse.json({ message: "Fetch run finished", summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 300;
