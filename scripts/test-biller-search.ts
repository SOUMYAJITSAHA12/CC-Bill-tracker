import { config } from "dotenv";
config({ path: ".env.local" });

import { decryptResData, encryptReqData } from "../lib/billdesk/crypto";
import { OP } from "../lib/billdesk/operations";

const BASE = "https://hexagon.billdesk.com/hgapp-instapay";
const SESSION = "werwer23423432";
const ctx = { sessionKey: SESSION, preLogin: true };

async function post(op: string, payload: object) {
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
  const text = await res.text();
  if (!text) throw new Error(`${op} empty HTTP ${res.status}`);
  const json = JSON.parse(text);
  const rs = json.MB?.RS;
  if (!rs?.RESDATA || !rs?.RESTOKEN) {
    throw new Error(`${op} bad response: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return JSON.parse(decryptResData(rs.RESDATA, ctx, op, rs.RESTOKEN));
}

async function main() {
  await post(OP.INIT, {
    customer: {},
    device: { init_channel: "Internet", ip: "124.124.1.1", mac: "11-AC-58-21-1B-AA" },
  });

  for (const term of ["axis", "Axis", "AXIS"]) {
    const r = await post("NLIBILLERLSSEARCH", {
      biller_category: "Credit Card",
      searchstring: term,
    });
    const list = r.list_of_search ?? r.BILLER ?? [];
    console.log(`search "${term}":`, list.length, "hits");
    const axis = (list as { biller_name?: string; biller_id?: string }[]).filter(
      (b) => /axis/i.test(b.biller_name ?? "")
    );
    console.log(JSON.stringify(axis.slice(0, 2), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
