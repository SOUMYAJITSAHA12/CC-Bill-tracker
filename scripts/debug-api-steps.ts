import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { BillDeskClient } from "../lib/billdesk/client";
import { OP } from "../lib/billdesk/operations";

async function main() {
  const client = new BillDeskClient();
  try {
    console.log("1. NLIINIT...");
    await client.init();
    console.log("   OK");

    console.log("2. NLIBILLERS (Credit Card)...");
    const map = await client.loadBillers("Credit Card");
    console.log("   billers:", [...map.keys()].slice(0, 10));
    const axis = map.get("axis bank credit card");
    console.log("   axis:", axis);

    if (axis) {
      const id = axis.biller_id ?? axis.billerid;
      console.log("3. NLIBILLERS billerid", id);
      const details = await client.loadBillerDetails(id!);
      console.log(
        "   authenticators:",
        details.authenticators?.map((a) => a.parameter_name)
      );
    }

    console.log("4. fetchBill...");
    const result = await client.fetchBill({
      bank: "axis",
      mobile: "9735259622",
      last4: "6402",
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

main();
