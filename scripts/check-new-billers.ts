/**
 * Query BillDesk for all Credit Card billers and diff against BANK_BILLER_MAP.
 * Prints:
 *  - MISSING: billers BillDesk supports but we don't have in our map
 *  - MATCHED: billers we already support
 *  - EXTRA:   entries in our map that BillDesk didn't return (renamed/removed?)
 *
 *   npx tsx scripts/check-new-billers.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { BillDeskClient } from "../lib/billdesk/client";
import { OP } from "../lib/billdesk/operations";
import { BANK_BILLER_MAP } from "../lib/banks";

type BillerRow = {
  biller_id?: string;
  billerid?: string;
  biller_name?: string;
  billername?: string;
  biller_category?: string;
};

async function main() {
  const client = new BillDeskClient();
  await client.init();

  // Reach into the private post/decryptResponse; we want the raw list, not the search-based lookup
  const c = client as unknown as {
    post: (op: string, p: unknown) => Promise<{ MB?: { RS?: { STATUSCODE?: string; MESSAGE?: string } } }>;
    decryptResponse: (json: unknown, op: string) => unknown;
  };

  const collected = new Map<string, BillerRow>();

  // Strategy A: NLIBILLERS with biller_category = "Credit Card" (bulk listing)
  try {
    const json = await c.post(OP.BILLERS, { biller_category: "Credit Card" });
    if (json?.MB?.RS?.STATUSCODE && json.MB.RS.STATUSCODE !== "0") {
      console.log("NLIBILLERS(Credit Card) status:", json.MB.RS.STATUSCODE, json.MB.RS.MESSAGE);
    } else {
      const plain = c.decryptResponse(json, OP.BILLERS) as {
        BILLER?: BillerRow[];
        biller?: BillerRow[];
      };
      const list = (plain?.BILLER ?? plain?.biller ?? []) as BillerRow[];
      for (const b of list) {
        const name = (b.biller_name ?? b.billername ?? "").trim();
        if (name) collected.set(name.toLowerCase(), b);
      }
      console.log(`NLIBILLERS(Credit Card) returned ${list.length} billers`);
    }
  } catch (e) {
    console.log("NLIBILLERS bulk failed:", e instanceof Error ? e.message : e);
  }

  // Strategy B: fallback via NLIBILLERLSSEARCH with common alphabetic seeds,
  // in case the bulk endpoint returned nothing / a subset.
  if (collected.size === 0) {
    console.log("Falling back to per-letter search…");
    const seeds = "abcdefghijklmnopqrstuvwxyz".split("");
    for (const s of seeds) {
      try {
        const json = await c.post(OP.BILLER_SEARCH, {
          biller_category: "Credit Card",
          searchstring: s,
        });
        const plain = c.decryptResponse(json, OP.BILLER_SEARCH) as {
          list_of_search?: BillerRow[];
        };
        for (const b of plain?.list_of_search ?? []) {
          const name = (b.biller_name ?? b.billername ?? "").trim();
          if (name) collected.set(name.toLowerCase(), b);
        }
      } catch {
        // ignore individual letter failures
      }
    }
    console.log(`Search-based sweep found ${collected.size} unique billers`);
  }

  // Build lookup by name from our BANK_BILLER_MAP
  const known = new Map<string, string>(); // biller_name (lower) -> our bank key
  for (const [bank, meta] of Object.entries(BANK_BILLER_MAP)) {
    known.set(meta.name.toLowerCase(), bank);
  }

  const remoteNames = [...collected.keys()].sort();
  const missing: BillerRow[] = [];
  const matched: { bank: string; name: string; id?: string }[] = [];
  for (const lower of remoteNames) {
    const b = collected.get(lower)!;
    const displayName = b.biller_name ?? b.billername ?? "";
    const id = b.biller_id ?? b.billerid;
    if (known.has(lower)) {
      matched.push({ bank: known.get(lower)!, name: displayName, id });
    } else {
      missing.push(b);
    }
  }

  const extra: { bank: string; name: string }[] = [];
  for (const [name, bank] of known.entries()) {
    if (!collected.has(name)) {
      extra.push({ bank, name: BANK_BILLER_MAP[bank].name });
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`BillDesk credit-card billers returned: ${remoteNames.length}`);
  console.log(`Already in BANK_BILLER_MAP: ${matched.length}`);
  console.log(`Missing from our map (NEW / not supported): ${missing.length}`);
  console.log(`In our map but not returned by BillDesk: ${extra.length}`);

  if (missing.length > 0) {
    console.log(`\n=== MISSING (add these to BANK_BILLER_MAP) ===`);
    for (const b of missing) {
      console.log(
        `  ${b.biller_name ?? b.billername}   billerId=${b.biller_id ?? b.billerid ?? "?"}`
      );
    }
  }

  if (extra.length > 0) {
    console.log(`\n=== IN MAP BUT NOT RETURNED BY BILLDESK ===`);
    for (const e of extra) {
      console.log(`  ${e.bank} -> "${e.name}"`);
    }
  }

  console.log(`\n=== MATCHED ===`);
  for (const m of matched) {
    console.log(`  ${m.bank.padEnd(12)} ${m.name}   ${m.id ?? ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
