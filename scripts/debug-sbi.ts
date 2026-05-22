import { config } from "dotenv";
config({ path: ".env.local" });

import { BillDeskClient } from "../lib/billdesk/client";
import { OP } from "../lib/billdesk/operations";

async function tryFetch(mobile: string, last4: string) {
  const client = new BillDeskClient();
  await client.init();
  const biller = await client.searchBiller("sbi");
  const billerId = biller?.biller_id ?? biller?.billerid;
  const details = await client.loadBillerDetails(billerId!);
  const authDefs = details.authenticators ?? [];
  console.log("\n---", mobile, last4, "---");
  console.log("auth order:", authDefs.map((a) => a.parameter_name));

  const result = await client.fetchBill({ bank: "sbi", mobile, last4 });
  console.log("result:", result);

  if (result.status === "NO_DUES" || result.status === "FAILED") {
    const raw = await client.fetchBillRaw({ bank: "sbi", mobile, last4 });
    console.log("raw:", JSON.stringify(raw, null, 2));
  }
}

async function main() {
  await tryFetch("8926860913", "6090");
  await tryFetch("9735259622", "6090");
}

main();
