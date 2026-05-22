/**
 * Local / GitHub Actions batch fetch (no browser).
 * Requires BillDesk crypto in lib/billdesk/crypto.ts
 *
 * Usage: npm run fetch:bills
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { runBatchFetch } from "../lib/fetch-runner";

async function main() {
  console.log("Starting BillDesk batch fetch…");
  const summary = await runBatchFetch();
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
