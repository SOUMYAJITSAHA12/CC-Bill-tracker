import { decryptPayload, decryptRamdomKey } from "../lib/billdesk/crypto";

const RES = {
  RESTOKEN: "vh3puWbIDspwZDv/Sl3Zq8aY",
  RESDATA:
    "W/7BctWOUIKBH0Zj1qiA2CTPlPLX6tC1lLdgQtJVagps2Q7rAib6cMbXIXT7zpM5isnWUdqs0b2xrGI/TByCLJoNXzlw/YcyVHC05UijQssg4U37LWoGTca3nB611OnrLaOG1cPc+MQFKkoSSxDSN8RncsTNzJQc7X7I",
};

const keys = [
  "NLIINIT",
  "NLIINIT|werwer23423432",
  "NLIBILLERCATEGORIES",
];

for (const op of keys) {
  try {
    const rk = decryptRamdomKey(RES.RESTOKEN);
    const encKey = op; // will use generateEncKey inside
    const plain = decryptPayload(RES.RESDATA, RES.RESTOKEN, op.split("|")[0]);
    console.log("op", op, "rk", rk, "->", plain.slice(0, 120));
    JSON.parse(plain);
    console.log("  VALID JSON");
  } catch (e) {
    console.log("op", op, "FAIL", String(e).slice(0, 80));
  }
}
