/**
 * Cleanup duplicate bill rows:
 * - Remove UNPAID when PAID exists for same card + due_date
 * - Remove extra PAID when UNPAID exists for same card + due_date (keep one UNPAID)
 * Run: npx tsx scripts/cleanup-duplicate-unpaid.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const { data: unpaid, error } = await supabase
    .from("bills")
    .select("id, card_id, due_date")
    .eq("status", "UNPAID");

  if (error) throw error;

  let removed = 0;
  for (const row of unpaid ?? []) {
    const { data: paid } = await supabase
      .from("bills")
      .select("id")
      .eq("card_id", row.card_id)
      .eq("due_date", row.due_date)
      .eq("status", "PAID")
      .limit(1);

    if (paid?.length) {
      const { error: delErr } = await supabase.from("bills").delete().eq("id", row.id);
      if (delErr) console.error(row.id, delErr.message);
      else {
        removed++;
        console.log("Removed duplicate UNPAID", row.id, row.card_id, row.due_date);
      }
    }
  }
  let removedPaid = 0;
  const { data: openRows } = await supabase
    .from("bills")
    .select("id, card_id, due_date")
    .in("status", ["UNPAID", "PARTIAL"]);

  for (const row of openRows ?? []) {
    const { data: paid } = await supabase
      .from("bills")
      .select("id")
      .eq("card_id", row.card_id)
      .eq("due_date", row.due_date)
      .eq("status", "PAID");

    for (const p of paid ?? []) {
      const { error: delErr } = await supabase.from("bills").delete().eq("id", p.id);
      if (!delErr) {
        removedPaid++;
        console.log("Removed PAID duplicate (open bill exists)", p.id);
      }
    }
  }

  console.log(
    `Done. Removed ${removed} duplicate UNPAID and ${removedPaid} duplicate PAID bill(s).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
