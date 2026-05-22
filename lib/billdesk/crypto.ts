/**
 * BillDesk InstaPay REQDATA/RESDATA crypto (ported from main.*.js ConfigService).
 * AES-GCM via node-forge; key derivation via SHA256 (crypto-js).
 */
import CryptoJS from "crypto-js";
import forge from "node-forge";

const ENCRYPT_DECRYPT_RANDOM_KEY =
  process.env.BILLDESK_RANDOM_KEY ?? "5bb0411b18b4a90e";
const CERT_THUMB_KEY =
  process.env.BILLDESK_CERT_THUMB ?? "7e2f8b054a76b935c33d980023b5ffc6616e0b0b";

export type SessionCryptoCtx = {
  sessionKey: string;
  reqToken?: string;
  resToken?: string;
  /** Pre Login flow (KTK03 portal) — encrypt uses OPERATIONID only */
  preLogin?: boolean;
};

function encodeUtf8(str: string): string {
  return forge.util.encodeUtf8(str);
}

export function getRandomKey(): string {
  const possible = "123456789";
  let text = "";
  for (let i = 0; i < 2; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getKeyGenerationString(randomKey: string): string {
  const r = parseInt(randomKey.substring(0, 1), 10);
  const a = parseInt(randomKey.substring(1, 2), 10);
  return CERT_THUMB_KEY.substring(r, r + a);
}

function splitCipherBlob(b64: string): { ciphertext: string; tag: string } {
  const raw = forge.util.decode64(b64);
  const tagLen = 16;
  if (raw.length < tagLen) {
    throw new Error("Invalid encrypted blob");
  }
  return {
    ciphertext: raw.slice(0, raw.length - tagLen),
    tag: raw.slice(raw.length - tagLen),
  };
}

export function encryptRamdomKey(randomKey: string): string {
  const rkEncryptionKey = encodeUtf8(ENCRYPT_DECRYPT_RANDOM_KEY);
  const iv = rkEncryptionKey.substring(0, 14);
  const cipher = forge.cipher.createCipher("AES-GCM", rkEncryptionKey);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(encodeUtf8(randomKey)));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes() + cipher.mode.tag.getBytes());
}

export function decryptRamdomKey(encrandomkey: string): string {
  const rkEncryptionKey = encodeUtf8(ENCRYPT_DECRYPT_RANDOM_KEY);
  const { ciphertext, tag } = splitCipherBlob(encrandomkey);
  const decipher = forge.cipher.createDecipher("AES-GCM", rkEncryptionKey);
  decipher.start({
    iv: rkEncryptionKey.substring(0, 14),
    tag: forge.util.createBuffer(tag),
  });
  decipher.update(forge.util.createBuffer(ciphertext));
  decipher.finish();
  return decipher.output.toString();
}

export function generateEncKey(
  operationKey: string,
  encrandomkey: string
): string {
  const randomsaltkey = decryptRamdomKey(encrandomkey);
  const keypartcert = getKeyGenerationString(randomsaltkey);
  const combined = `${keypartcert}|${operationKey}`;
  const hash = CryptoJS.SHA256(randomsaltkey + combined).toString(
    CryptoJS.enc.Hex
  );
  return (
    hash.substring(0, 4) +
    hash.substring(16, 20) +
    hash.substring(32, 36) +
    hash.substring(48, 52)
  );
}

/** Operation string used when encrypting REQDATA */
export function encryptOperationKey(
  operationId: string,
  sessionKey: string,
  preLogin = true
): string {
  const loginOps = new Set([
    "LOGIN",
    "HDFCLOGIN",
    "SUYALOGIN",
    "SCBLOGIN",
    "ZTNCLOGIN",
    "SBICCLOGIN",
    "ALHBDLOGIN",
    "OBCLOGIN",
  ]);
  if (loginOps.has(operationId) || preLogin) {
    return operationId;
  }
  return `${operationId}|${sessionKey}`;
}

/** Operation string used when decrypting RESDATA */
export function decryptOperationKey(
  operationId: string,
  sessionKey: string,
  preLogin = true
): string {
  const key = `${operationId}|${sessionKey}`;
  if (preLogin) {
    return key.split("|")[0];
  }
  return key;
}

export function encryptPayload(
  plaintext: string,
  encrandomkey: string,
  operationKey: string
): string {
  let enckey = generateEncKey(operationKey, encrandomkey);
  enckey = encodeUtf8(enckey);
  const iv = enckey.substring(0, 14);
  const cipher = forge.cipher.createCipher("AES-GCM", enckey);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(encodeUtf8(plaintext)));
  cipher.finish();
  return forge.util.encode64(
    cipher.output.getBytes() + cipher.mode.tag.getBytes()
  );
}

export function decryptPayload(
  ciphertext: string,
  encrandomkey: string,
  operationKey: string
): string {
  let enckey = generateEncKey(operationKey, encrandomkey);
  enckey = encodeUtf8(enckey);
  const { ciphertext: ct, tag } = splitCipherBlob(ciphertext);
  const decipher = forge.cipher.createDecipher("AES-GCM", enckey);
  decipher.start({ iv: enckey.substring(0, 14), tag: forge.util.createBuffer(tag) });
  decipher.update(forge.util.createBuffer(ct));
  decipher.finish();
  return decipher.output.toString();
}

export function encryptReqData(
  plaintext: string,
  ctx: SessionCryptoCtx,
  operationId: string
): { reqData: string; reqToken: string; randomKey: string } {
  const impl = process.env.BILLDESK_ENCRYPT_IMPL;
  if (impl === "passthrough") {
    return {
      reqData: Buffer.from(plaintext, "utf8").toString("base64"),
      reqToken: "debug",
      randomKey: "00",
    };
  }

  const randomKey = getRandomKey();
  const reqToken = encryptRamdomKey(randomKey);
  const opKey = encryptOperationKey(
    operationId,
    ctx.sessionKey,
    ctx.preLogin ?? true
  );
  const reqData = encryptPayload(plaintext, reqToken, opKey);
  return { reqData, reqToken, randomKey };
}

export function decryptResData(
  ciphertext: string,
  ctx: SessionCryptoCtx,
  operationId: string,
  resToken: string
): string {
  const opKey = decryptOperationKey(
    operationId,
    ctx.sessionKey,
    ctx.preLogin ?? true
  );
  return decryptPayload(ciphertext, resToken, opKey);
}
