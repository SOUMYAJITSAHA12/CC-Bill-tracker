import { ensureHousehold, getHouseholdId, isAuthSkipped } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { runBatchFetch, type FetchProgressEvent } from "@/lib/fetch-runner";

/**
 * Streaming variant of /api/fetch/trigger.
 *
 * Returns `application/x-ndjson` — one JSON event per line:
 *   { "type": "start", "total": 18, "lanes": [...] }
 *   { "type": "card_start", "nickname": "Axis Flipkart Baba", "done": 0, "total": 18 }
 *   { "type": "card_done", "outcome": { ... }, "done": 1, "total": 18 }
 *   ...
 *   { "type": "complete", "summary": { ... } }
 *
 * The frontend reads this as a stream so the "Fetch all bills" button can show
 * real progress instead of an indeterminate spinner.
 */
type StreamBody = {
  excludeCardIds?: unknown;
  alreadyDone?: unknown;
  runId?: unknown;
};

export async function POST(request: Request) {
  // Resolve the caller's household BEFORE opening the stream so we can reject
  // unauthorized calls with a clean 401 and so `runBatchFetch` never runs
  // unscoped (previously it fetched every card across every household).
  let excludeCardIds: string[] = [];
  let alreadyDone = 0;
  let runId: string | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as StreamBody;
      if (Array.isArray(body.excludeCardIds)) {
        excludeCardIds = body.excludeCardIds.filter(
          (id): id is string => typeof id === "string"
        );
      }
      if (typeof body.alreadyDone === "number" && Number.isFinite(body.alreadyDone)) {
        alreadyDone = Math.max(0, Math.floor(body.alreadyDone));
      }
      if (typeof body.runId === "string" && /^run_\d+$/.test(body.runId)) {
        runId = body.runId;
      }
    }
  } catch {
    // Empty or non-JSON body means "fetch the whole household".
  }

  let householdId: string;
  try {
    if (isAuthSkipped()) {
      householdId = await getHouseholdId();
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      householdId = await ensureHousehold(user.id);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve household";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: FetchProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // controller may already be closed if the client disconnected
        }
      };

      try {
        // Stop starting new cards well before Vercel's maxDuration (300s).
        // A slow card (ICICI retries) can still be in flight, so the budget
        // leaves about two minutes for it to finish and for `continue` to
        // flush. The dashboard opens the next request on its own.
        const budgetMs = Number(process.env.FETCH_STREAM_BUDGET_MS ?? 170_000);
        await runBatchFetch({
          householdId,
          excludeCardIds,
          alreadyDone,
          runId,
          deadlineAt: Date.now() + (Number.isFinite(budgetMs) ? budgetMs : 200_000),
          onProgress: write,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Fetch failed";
        write({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";
