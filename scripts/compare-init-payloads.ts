import { config } from "dotenv";
config({ path: ".env.local" });

import {
  decryptPayload,
  decryptResData,
  encryptReqData,
} from "../lib/billdesk/crypto";

const BASE = "https://hexagon.billdesk.com/hgapp-instapay";
const SESSION = "werwer23423432";
const ctx = { sessionKey: SESSION, preLogin: true };

async function post(plainObj: object, op: string) {
  const { reqData, reqToken } = encryptReqData(
    JSON.stringify(plainObj),
    ctx,
    op
  );
  const body = {
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
  };
  const res = await fetch(`${BASE}/InstaPayController`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://hexagon.billdesk.com",
      Referer: `${BASE}/`,
    },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  const rs = json.MB.RS;
  console.log("\n=== plain", JSON.stringify(plainObj), "===");
  console.log("REQTOKEN sent", reqToken);
  console.log("RESTOKEN recv", rs.RESTOKEN);

  const a = decryptPayload(rs.RESDATA, rs.RESTOKEN, "NLIINIT");
  console.log("decryptPayload:", a.slice(0, 100));

  const b = decryptResData(rs.RESDATA, ctx, "NLIINIT", rs.RESTOKEN);
  console.log("decryptResData:", b.slice(0, 100));
}

async function main() {
  await post({}, "NLIINIT");
  await post(
    {
      customer: {},
      device: {
        init_channel: "Internet",
        ip: "124.124.1.1",
        mac: "11-AC-58-21-1B-AA",
      },
    },
    "NLIINIT"
  );
}

main().catch(console.error);
