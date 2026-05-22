/**
 * Test single card bill fetch
 * npx tsx scripts/test-fetch-one.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { fetchBillForCard } from "../lib/billdesk/client";

async function main() {
  const card = {
    bank: "axis",
    mobile: process.env.TEST_MOBILE ?? "9735259622",
    last4: process.env.TEST_LAST4 ?? "6402",
  };

  console.log("Testing BillDesk fetch for:", card);
  try {
    const result = await fetchBillForCard(card);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
