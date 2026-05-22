import {
  decryptPayload,
  decryptRamdomKey,
  encryptPayload,
  encryptRamdomKey,
  generateEncKey,
} from "../lib/billdesk/crypto";

// Captured from browser DevTools (NLIINIT)
const CAPTURED = {
  reqToken: "vB+yRg9MTkgIkm1kUeTES1HO",
  reqData:
    "RlnZkBxJeAOuYY+QlZvr4GdhXTK+/TLPKxyiTisfcnYeYRg0QFf1Y3m81wJcHdocRTyuC2RyAR9krQGkhGD2+kRhwaaQzdfmw+d7kRU5IXEcqv/h7MI5PCgPOtEHqjJ+cYwmAjFWr+6C2Xv77Un6iKA=",
  plain: "{}",
  op: "NLIINIT",
};

console.log("decryptRamdomKey(REQTOKEN):", decryptRamdomKey(CAPTURED.reqToken));
console.log(
  "generateEncKey op:",
  generateEncKey(CAPTURED.op, CAPTURED.reqToken)
);

try {
  const dec = decryptPayload(CAPTURED.reqData, CAPTURED.reqToken, CAPTURED.op);
  console.log("decrypt REQDATA:", dec);
} catch (e) {
  console.log("decrypt REQDATA error:", e);
}

// Round-trip with fixed random key
const rk = "37";
const encRk = encryptRamdomKey(rk);
console.log("encryptRamdomKey('37'):", encRk);
const enc = encryptPayload(CAPTURED.plain, encRk, CAPTURED.op);
console.log("encrypt {}:", enc.slice(0, 80) + "...");
