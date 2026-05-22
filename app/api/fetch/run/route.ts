import { NextResponse } from "next/server";
import { runBatchFetch } from "@/lib/fetch-runner";

/**
 * Cron / GitHub Actions entrypoint.
 * Authorization: Bearer <FETCH_CRON_SECRET>
 */
export async function POST(request: Request) {
  const secret = process.env.FETCH_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "FETCH_CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runBatchFetch();
    return NextResponse.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 300;
