/**
 * Audit open bills vs dashboard unpaid total.
 * Run: npx tsx scripts/audit-open-bills.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "../lib/supabase/admin";

function billRemaining(amount: number, amountPaid?: number | null) {
  return Math.max(0, Number(amount) - Number(amountPaid ?? 0));
}

async function main() {
  const supabase = createAdminClient();

  const { data: bills, error } = await supabase
    .from("bills")
    .select("id, card_id, due_date, amount, amount_paid, status, cards(nickname)")
    .in("status", ["UNPAID", "PARTIAL"])
    .order("due_date");

  if (error) throw error;

  let total = 0;
  for (const b of bills ?? []) {
    const rem = billRemaining(Number(b.amount), b.amount_paid);
    total += rem;
    const nick =
      (b.cards as { nickname?: string } | null)?.nickname ?? b.card_id;
    console.log(
      [
        b.status,
        nick,
        b.due_date,
        `amt=${b.amount}`,
        `paid=${b.amount_paid ?? 0}`,
        `rem=${rem.toFixed(2)}`,
      ].join(" | ")
    );
  }

  console.log("---");
  console.log("Open bills:", bills?.length ?? 0);
  console.log("Unpaid total (dashboard math):", total.toFixed(2));

  const { data: logs } = await supabase
    .from("fetch_log")
    .select("card_id, status, error, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(300);

  const latest = new Map<
    string,
    { status: string; error?: string | null; fetched_at: string }
  >();
  for (const l of logs ?? []) {
    if (!l.card_id || latest.has(l.card_id)) continue;
    latest.set(l.card_id, {
      status: l.status,
      error: l.error,
      fetched_at: l.fetched_at,
    });
  }

  const { data: cards } = await supabase.from("cards").select("id, nickname");
  const nickById = Object.fromEntries(
    (cards ?? []).map((c) => [c.id, c.nickname])
  );

  console.log("\nStale (latest fetch NO_DUES but still open bill in DB):");
  let staleTotal = 0;
  for (const b of bills ?? []) {
    const f = latest.get(b.card_id);
    if (f?.status !== "NO_DUES") continue;
    const rem = billRemaining(Number(b.amount), b.amount_paid);
    staleTotal += rem;
    console.log(
      `  ${nickById[b.card_id] ?? b.card_id}: ₹${rem.toFixed(2)} — ${(f.error ?? "").slice(0, 70)}`
    );
  }
  if (staleTotal > 0) {
    console.log(`Stale portion inflating total: ₹${staleTotal.toFixed(2)}`);
    console.log(`Adjusted total (excl. stale): ₹${(total - staleTotal).toFixed(2)}`);
  } else {
    console.log("  (none)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
