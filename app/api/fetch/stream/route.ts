import { isAuthSkipped } from "@/lib/household";
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
export async function POST() {
  if (!isAuthSkipped()) {
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
        await runBatchFetch({ onProgress: write });
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
