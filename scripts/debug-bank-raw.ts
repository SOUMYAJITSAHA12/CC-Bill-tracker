/**
 * Debug raw BillDesk validate response
 * npx tsx scripts/debug-bank-raw.ts bob 9735259622 4271
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { BillDeskClient } from "../lib/billdesk/client";
import { OP } from "../lib/billdesk/operations";
import { billerNameForBank } from "../lib/banks";

async function main() {
  const bank = process.argv[2] ?? "bob";
  const mobile = process.argv[3] ?? "9735259622";
  const last4 = process.argv[4] ?? "4271";

  const client = new BillDeskClient();
  await client.init();

  const biller = await client.searchBiller(bank);
  console.log("biller:", biller);
  if (!biller) return;

  const billerId = biller.biller_id ?? biller.billerid;
  const details = await client.loadBillerDetails(billerId!);
  console.log("auth:", details.authenticators);

  const result = await client.fetchBill({ bank, mobile, last4 });
  console.log("parsed:", result);

  // Also dump via internal flow if parse failed
  if (result.status === "FAILED" && result.error?.includes("parse")) {
    console.log("\nRe-run fetchBill - check server logs or extend client to log plain JSON");
  }
}

main();
