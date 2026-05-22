import { config } from "dotenv";
config({ path: ".env.local" });

import { encryptReqData, decryptResData } from "../lib/billdesk/crypto";

const BASE = "https://hexagon.billdesk.com/hgapp-instapay";
const SESSION = "werwer23423432";

async function rawPost(op: string, payload: object) {
  const ctx = { sessionKey: SESSION, preLogin: true };
  const { reqData, reqToken } = encryptReqData(
    JSON.stringify(payload),
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(op, "status", res.status, "len", text.length);
  if (!text) return null;
  const json = JSON.parse(text);
  console.log("STATUSCODE", json?.MB?.RS?.STATUSCODE, "RESPONSE", json?.MB?.RS?.RESPONSE);
  const rs = json?.MB?.RS;
  if (rs?.RESDATA && rs?.RESTOKEN) {
    try {
      const plain = decryptResData(rs.RESDATA, ctx, op, rs.RESTOKEN);
      console.log("decrypted preview:", plain.slice(0, 300));
      const parsed = JSON.parse(plain);
      console.log("decrypted keys:", Object.keys(parsed));
    } catch (e) {
      console.log("decrypt failed:", e);
      console.log("RESDATA len", rs.RESDATA.length, "RESTOKEN len", rs.RESTOKEN.length);
    }
  } else {
    console.log(JSON.stringify(json).slice(0, 400));
  }
  return json;
}

async function main() {
  await rawPost("NLIINIT", {});
  await rawPost("NLIBILLERCATEGORIES", {});
  await rawPost("NLIBILLERS", { biller_category: "Credit Card" });
  await rawPost("NLIBILLERS", {});
}

main().catch(console.error);
