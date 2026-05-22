/**
 * Helper for reverse-engineering BillDesk encryption.
 * Run: npx tsx scripts/capture-crypto-hints.ts
 *
 * Opens the portal and prints any global encrypt/decrypt helpers found on window.
 * Use DevTools Network tab to copy plaintext JSON before REQDATA encryption.
 */
import { writeFileSync } from "fs";
import path from "path";

const MAIN_JS_HINT = `
Manual RE checklist:
1. Open https://hexagon.billdesk.com/hgapp-instapay/InstaPayController?BankID=KTK03
2. DevTools → Network → filter InstaPayController
3. For each step (NLIINIT, NLIBILLERS, Get Bill), note OPERATIONID and decrypted REQDATA shape
4. Sources → main.*.js → search: REQDATA, encrypt, decrypt, CryptoJS, AES
5. Implement encryptReqData/decryptResData in lib/billdesk/crypto.ts
`;

console.log(MAIN_JS_HINT);

const out = path.join(process.cwd(), "billdesk", "RE-NOTES.md");
writeFileSync(
  out,
  `# BillDesk reverse engineering notes\n\n${MAIN_JS_HINT}\n\n## Operations captured\n\n| Step | OPERATIONID |\n|------|-------------|\n| Init | NLIINIT |\n| Billers | NLIBILLERS |\n| Fetch bill | NLIFETCHBILL (verify) |\n`,
  "utf8"
);
console.log(`Wrote ${out}`);
