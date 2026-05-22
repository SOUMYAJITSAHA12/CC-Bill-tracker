import { config } from "dotenv";
config({ path: ".env.local" });

import { BillDeskClient } from "../lib/billdesk/client";
import { OP } from "../lib/billdesk/operations";
import { decryptResData, encryptReqData } from "../lib/billdesk/crypto";

const BASE = "https://hexagon.billdesk.com/hgapp-instapay";
const SESSION = "werwer23423432";

async function raw(op: string, payload: object) {
  const ctx = { sessionKey: SESSION, preLogin: true };
  const { reqData, reqToken } = encryptReqData(JSON.stringify(payload), ctx, op);
  const res = await fetch(`${BASE}/InstaPayController`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://hexagon.billdesk.com",
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      MB: {
        OPERATIONID: op,
        SESSIONKEY: SESSION,
        REQTOKEN: reqToken,
        RQ: {
          APPINFO: { APPID: "KTK03", CHANNEL: "Internet", APPVER: "1.0" },
          DEVICEINFO: {
            DEVICEWLID: "eweqweq-qweqw-qweqw-qweqw",
            DEVICEIMEI: "1234567891012",
            DEVICEMAC: "",
            DEVICEIP: "",
            DEVICEMODEL: "",
            DEVICEOS: "Internet",
            DEVICELAT: "",
            DEVICELONG: "",
          },
          REQDATA: reqData,
        },
      },
    }),
  });
  const json = JSON.parse(await res.text());
  const rs = json.MB.RS;
  const plain = decryptResData(rs.RESDATA, ctx, op, rs.RESTOKEN);
  return JSON.parse(plain);
}

async function main() {
  await raw("NLIINIT", {
    customer: {},
    device: { init_channel: "Internet", ip: "124.124.1.1", mac: "11-AC-58-21-1B-AA" },
  });

  const cats = await raw("NLIBILLERCATEGORIES", {});
  console.log("categories keys", Object.keys(cats));
  const catList = cats.CATEGORY ?? cats.category ?? cats;
  console.log(
    "sample categories:",
    JSON.stringify(Array.isArray(catList) ? catList.slice(0, 5) : catList, null, 2).slice(0, 1500)
  );

  const creditCats = (cats.BILLERCATEGORIES as { categoryName: string }[]).filter(
    (x) => /credit|card/i.test(x.categoryName)
  );
  console.log(
    "credit categories:",
    creditCats.map((x) => x.categoryName)
  );

  for (const { categoryName: name } of [
    ...creditCats,
    { categoryName: "Credit Card" },
  ]) {
    try {
      const billers = await raw("NLIBILLERS", { biller_category: name });
      const list = billers.BILLER ?? billers.biller ?? billers;
      const arr = Array.isArray(list) ? list : [];
      console.log(`\nNLIBILLERS("${name}") count:`, arr.length);
      const axis = arr.filter((b: { biller_name?: string }) =>
        (b.biller_name ?? "").toLowerCase().includes("axis")
      );
      console.log("axis matches:", axis.slice(0, 2));
    } catch (e) {
      console.log(`NLIBILLERS("${name}") error:`, e);
    }
  }
}

main().catch(console.error);
