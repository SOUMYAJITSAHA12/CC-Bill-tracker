import fs from "fs";
import path from "path";
import os from "os";

const jsPath =
  process.argv[2] ||
  path.join(os.tmpdir(), "billdesk-main.js");

if (!fs.existsSync(jsPath)) {
  console.error("Missing", jsPath);
  process.exit(1);
}

const s = fs.readFileSync(jsPath, "utf8");

function ctx(term, before = 500, after = 800) {
  const i = s.indexOf(term);
  if (i < 0) return null;
  return s.slice(Math.max(0, i - before), i + term.length + after);
}

// OPERATIONIDs
const opRe = /OPERATIONID:"([A-Z0-9_]+)"/g;
const ops = new Set();
let m;
while ((m = opRe.exec(s))) ops.add(m[1]);
console.log("=== OPERATIONIDs ===");
console.log([...ops].sort().join("\n"));

// Interesting snippets
const terms = [
  "REQDATA=",
  ".REQDATA",
  "RESDATA",
  "RESTOKEN",
  "REQTOKEN",
  "generateKey",
  "publicKey",
  "privateKey",
  "encrypt",
  "decrypt",
  "NLIINIT",
  "setRequestData",
  "getRequestData",
  "encryptData",
  "decryptData",
];

console.log("\n=== Context snippets ===");
for (const t of terms) {
  const c = s.split(t).length - 1;
  if (!c) continue;
  console.log(`\n--- ${t} (${c}) ---`);
  const snippet = ctx(t, 300, 600);
  if (snippet) console.log(snippet.replace(/\s+/g, " ").slice(0, 900));
}
