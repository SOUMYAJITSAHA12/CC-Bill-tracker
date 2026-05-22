import { NextResponse } from "next/server";
import { isAuthSkipped } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isAuthSkipped()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runnerUrl = process.env.FETCH_RUNNER_URL;
  const secret = process.env.FETCH_CRON_SECRET;

  if (runnerUrl && secret) {
    const res = await fetch(runnerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error ?? "Runner failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      message: "Fetch completed via runner",
      summary: json,
    });
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Set FETCH_CRON_SECRET in .env.local, or run: npm run fetch:bills",
      },
      { status: 503 }
    );
  }

  const res = await fetch(`${base}/api/fetch/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(
      {
        error:
          (json as { error?: string }).error ??
          "Fetch failed. Use: npm run fetch:bills for 100 cards.",
      },
      { status: 502 }
    );
  }

  const summary = await res.json();
  return NextResponse.json({
    message: "Fetch run finished",
    summary,
  });
}
