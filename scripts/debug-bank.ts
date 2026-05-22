/**
 * Debug BillDesk flow for a bank
 * npx tsx scripts/debug-bank.ts federal 9735259622 4342
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { BillDeskClient } from "../lib/billdesk/client";
import { billerNameForBank, searchTermForBank } from "../lib/banks";

async function main() {
  const bank = process.argv[2] ?? "federal";
  const mobile = process.argv[3] ?? "9735259622";
  const last4 = process.argv[4] ?? "4342";

  console.log({ bank, mobile, last4, target: billerNameForBank(bank), search: searchTermForBank(bank) });

  const client = new BillDeskClient();
  await client.init();
  console.log("init ok");

  const biller = await client.searchBiller(bank);
  console.log("biller:", JSON.stringify(biller, null, 2));

  if (!biller) {
    console.error("No biller match");
    process.exit(1);
  }

  const id = biller.biller_id ?? biller.billerid;
  const details = await client.loadBillerDetails(id!);
  console.log("authenticators:", JSON.stringify(details.authenticators, null, 2));

  const result = await client.fetchBill({ bank, mobile, last4 });
  if (result.error?.includes("parse")) {
    const raw = await client.fetchBillRaw({ bank, mobile, last4 });
    console.log("raw response:", JSON.stringify(raw, null, 2));
  }
  console.log("fetch result:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
