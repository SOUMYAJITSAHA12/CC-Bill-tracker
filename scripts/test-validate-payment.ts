import { config } from "dotenv";
config({ path: ".env.local" });

import { decryptResData, encryptReqData } from "../lib/billdesk/crypto";
import { OP } from "../lib/billdesk/operations";
import { parseBillFromPlaintext } from "../lib/billdesk/parser";

const BASE = "https://hexagon.billdesk.com/hgapp-instapay";
const SESSION = "werwer23423432";
const ctx = { sessionKey: SESSION, preLogin: true };
let scoreProvider = "KM01";

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
  const json = JSON.parse(text);
  const rs = json.MB?.RS;
  if (rs?.STATUSCODE !== "0") {
    throw new Error(`${op}: ${rs?.MESSAGE ?? rs?.STATUSCODE}`);
  }
  const plain = JSON.parse(decryptResData(rs.RESDATA, ctx, op, rs.RESTOKEN));
  if (op === OP.INIT && plain.OUID) scoreProvider = plain.OUID;
  return plain;
}

async function main() {
  await post(OP.INIT, {
    customer: {},
    device: { init_channel: "Internet", ip: "124.124.1.1", mac: "11-AC-58-21-1B-AA" },
  });

  const search = await post("NLIBILLERLSSEARCH", {
    biller_category: "Credit Card",
    searchstring: "axis",
  });
  const billerId = search.list_of_search[0].biller_id;
  console.log("billerId", billerId);

  const details = await post(OP.BILLERS, { billerid: billerId });
  const biller = details.BILLER;
  console.log(
    "authenticators:",
    biller.authenticators?.map((a: { parameter_name: string }) => a.parameter_name)
  );

  const mobile = "9735259622";
  const last4 = "6402";
  const authenticators = biller.authenticators.map(
    (a: { parameter_name: string; encryption_required?: string }) => {
      const p = a.parameter_name.toLowerCase();
      let value = "";
      if (p.includes("registered") && p.includes("mobile")) value = mobile;
      else if (p.includes("last") && (p.includes("4") || p.includes("card")))
        value = last4;
      return {
        parameter_name: a.parameter_name,
        value,
        encryption_required: a.encryption_required ?? "N",
      };
    }
  );
  console.log("auth values", authenticators);

  const validate = await post(OP.VALIDATE_PAYMENT, {
    authenticators,
    device: {
      init_channel: "Internet",
      ip: "124.124.1.1",
      mac: "11-AC-58-21-1B-AA",
    },
    customer: {
      email: "",
      mobile,
      lastname: "",
      firstname: "",
    },
    risk: [
      { score_type: "TXNRISK", score_provider: scoreProvider, score_value: "030" },
      { score_type: "TXNRISK", score_provider: "BBPS", score_value: "030" },
    ],
    billerid: billerId,
  });

  console.log("PAYMENT", JSON.stringify(validate.PAYMENT, null, 2).slice(0, 2000));
  const result = parseBillFromPlaintext(validate);
  console.log("parsed", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
