import { config } from "dotenv";
config({ path: ".env.local" });

import { encryptReqData } from "../lib/billdesk/crypto";

const BASE = "https://hexagon.billdesk.com/hgapp-instapay";
const SESSION = "werwer23423432";

async function main() {
  const ctx = { sessionKey: SESSION, preLogin: true };
  const plain = JSON.stringify({
    customer: {},
    device: {
      init_channel: "Internet",
      ip: "124.124.1.1",
      mac: "11-AC-58-21-1B-AA",
    },
  });
  const { reqData, reqToken } = encryptReqData(plain, ctx, "NLIINIT");

  const body = {
    MB: {
      OPERATIONID: "NLIINIT",
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
  const text = await res.text();
  console.log("status", res.status, "len", text.length);
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
}

main().catch(console.error);
