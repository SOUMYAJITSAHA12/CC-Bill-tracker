/**
 * Close open bills when latest fetch_log for that card is NO_DUES.
 * Run: npx tsx scripts/repair-no-dues-open-bills.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  const { data: logs } = await supabase
    .from("fetch_log")
    .select("card_id, status, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(500);

  const latestStatus = new Map<string, string>();
  for (const l of logs ?? []) {
    if (!l.card_id || latestStatus.has(l.card_id)) continue;
    latestStatus.set(l.card_id, l.status);
  }

  const { data: openBills } = await supabase
    .from("bills")
    .select("id, card_id, due_date, amount, status, cards(nickname)")
    .in("status", ["UNPAID", "PARTIAL"]);

  const paidAt = new Date().toISOString();
  let closed = 0;

  for (const bill of openBills ?? []) {
    if (latestStatus.get(bill.card_id) !== "NO_DUES") continue;

    const { data: paidRows } = await supabase
      .from("bills")
      .select("id")
      .eq("card_id", bill.card_id)
      .eq("due_date", bill.due_date)
      .eq("status", "PAID")
      .limit(1);

    if (paidRows?.length) {
      await supabase.from("bills").delete().eq("id", bill.id);
    } else {
      await supabase
        .from("bills")
        .update({
          status: "PAID",
          amount_paid: Number(bill.amount),
          paid_at: paidAt,
        })
        .eq("id", bill.id);
    }

    const nick =
      (bill.cards as { nickname?: string } | null)?.nickname ?? bill.card_id;
    console.log("Closed", nick, bill.due_date, bill.status, "₹" + bill.amount);
    closed++;
  }

  console.log(`Done. Closed ${closed} stale open bill(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
