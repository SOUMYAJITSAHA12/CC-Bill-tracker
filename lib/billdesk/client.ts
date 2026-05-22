import { OP } from "./operations";
import {
  decryptResData,
  encryptReqData,
  type SessionCryptoCtx,
} from "./crypto";
import { isNoDuesMessage } from "./no-dues";
import { parseBillFromPlaintext } from "./parser";
import {
  billerIdForBank,
  billerNameForBank,
  searchTermForBank,
} from "@/lib/banks";
import type { BillFetchResult } from "@/lib/types";

const DEFAULT_BASE =
  process.env.BILLDESK_BASE ?? "https://hexagon.billdesk.com/hgapp-instapay";
const APP_ID = process.env.BILLDESK_APP_ID ?? "KTK03";

type MbRequest = {
  MB: {
    OPERATIONID: string;
    SESSIONKEY?: string;
    REQTOKEN?: string;
    RQ?: {
      APPINFO: { APPID: string; CHANNEL: string; APPVER: string };
      DEVICEINFO?: Record<string, string>;
      REQDATA: string;
    };
  };
};

type MbResponse = {
  MB?: {
    RS?: {
      RESPONSE?: string;
      STATUSCODE?: string;
      MESSAGE?: string;
      RESDATA?: string;
      RESTOKEN?: string;
    };
    RQ?: Record<string, unknown>;
    SESSIONKEY?: string;
    OPERATIONID?: string;
  };
};

const DEVICE_INFO = {
  DEVICEWLID: "eweqweq-qweqw-qweqw-qweqw",
  DEVICEIMEI: "1234567891012",
  DEVICEMAC: "",
  DEVICEIP: "",
  DEVICEMODEL: "",
  DEVICEOS: "Internet",
  DEVICELAT: "",
  DEVICELONG: "",
};

type BillerRow = {
  biller_id?: string;
  billerid?: string;
  biller_name?: string;
  billername?: string;
  authenticators?: BillerAuthenticator[];
};

type BillerAuthenticator = {
  parameter_name: string;
  value?: string;
  regex?: string;
  optional?: string;
  encryption_required?: string;
  data_type?: string;
};

export class BillDeskClient {
  private base: string;
  private sessionKey = "werwer23423432";
  private scoreProvider = "BBPS";
  private cryptoCtx: SessionCryptoCtx;
  private billerCache: Map<string, BillerRow> = new Map();
  private billerDetailsCache: Map<string, BillerRow> = new Map();

  constructor(baseUrl = DEFAULT_BASE) {
    this.base = baseUrl.replace(/\/$/, "");
    this.cryptoCtx = { sessionKey: this.sessionKey, preLogin: true };
  }

  /**
   * Force a fresh BillDesk session (new SESSIONKEY via NLIINIT).
   * Biller and biller-details caches are preserved — they don't depend on session.
   * Useful between rate-limited billers (e.g. ICICI) so each request looks like a new client.
   */
  async resetSession(): Promise<void> {
    this.sessionKey = "werwer23423432";
    this.cryptoCtx = { sessionKey: this.sessionKey, preLogin: true };
    await this.init();
  }

  private controllerUrl() {
    return `${this.base}/InstaPayController`;
  }

  private appInfo() {
    return { APPID: APP_ID, CHANNEL: "Internet", APPVER: "1.0" };
  }

  private async post(op: string, plainPayload: object): Promise<MbResponse> {
    const plain = JSON.stringify(plainPayload);
    const { reqData, reqToken } = encryptReqData(
      plain,
      this.cryptoCtx,
      op
    );

    const body: MbRequest = {
      MB: {
        OPERATIONID: op,
        SESSIONKEY: this.sessionKey,
        REQTOKEN: reqToken,
        RQ: {
          APPINFO: this.appInfo(),
          DEVICEINFO: DEVICE_INFO,
          REQDATA: reqData,
        },
      },
    };

    const res = await fetch(this.controllerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        Origin: "https://hexagon.billdesk.com",
        Referer: `${this.base}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `BillDesk HTTP ${res.status}: ${text.slice(0, 200)}`
      );
    }
    if (!text.trim()) {
      throw new Error(
        `BillDesk empty response for ${op} (HTTP ${res.status})`
      );
    }

    let json: MbResponse;
    try {
      json = JSON.parse(text) as MbResponse;
    } catch {
      throw new Error(
        `BillDesk invalid JSON for ${op}: ${text.slice(0, 200)}`
      );
    }
    this.applySessionFromResponse(json);
    return json;
  }

  private applySessionFromResponse(json: MbResponse) {
    const mb = json.MB;
    if (mb?.SESSIONKEY) {
      this.sessionKey = mb.SESSIONKEY;
      this.cryptoCtx.sessionKey = mb.SESSIONKEY;
    }
    if (mb?.RS?.RESTOKEN) {
      this.cryptoCtx.resToken = mb.RS.RESTOKEN;
    }
  }

  private decryptResponse(json: MbResponse, operationId: string): unknown {
    const resData = json.MB?.RS?.RESDATA;
    const resToken = json.MB?.RS?.RESTOKEN;
    if (!resData || !resToken) return null;
    const plain = decryptResData(
      resData,
      this.cryptoCtx,
      operationId,
      resToken
    );
    try {
      return JSON.parse(plain);
    } catch {
      return plain;
    }
  }

  private assertOk(json: MbResponse, step: string) {
    const status = json.MB?.RS?.STATUSCODE;
    const response = json.MB?.RS?.RESPONSE?.toLowerCase();
    if (status !== "0" && response !== "sucess" && response !== "success") {
      throw new Error(
        `${step} failed: ${json.MB?.RS?.MESSAGE ?? status ?? "unknown"}`
      );
    }
  }

  /** Step 1: NLIINIT */
  async init(): Promise<void> {
    const json = await this.post(OP.INIT, {
      customer: {},
      device: {
        init_channel: "Internet",
        ip: "124.124.1.1",
        mac: "11-AC-58-21-1B-AA",
      },
    });
    this.assertOk(json, OP.INIT);
    const plain = this.decryptResponse(json, OP.INIT) as {
      OUID?: string;
    } | null;
    if (plain?.OUID) {
      this.scoreProvider = plain.OUID;
    }
  }

  /**
   * Smart search billers (Credit Card uses NLIBILLERLSSEARCH, not category list).
   */
  async searchBiller(
    bank: string,
    category = "Credit Card"
  ): Promise<BillerRow | null> {
    const targetName = billerNameForBank(bank)?.toLowerCase();
    if (!targetName) return null;

    const cached = this.billerCache.get(targetName);
    if (cached) return cached;

    const hardcodedId = billerIdForBank(bank);
    if (hardcodedId) {
      const row: BillerRow = {
        biller_id: hardcodedId,
        biller_name: billerNameForBank(bank) ?? bank,
      };
      this.billerCache.set(targetName, row);
      return row;
    }

    const term = searchTermForBank(bank);
    const json = await this.post(OP.BILLER_SEARCH, {
      biller_category: category,
      searchstring: term,
    });
    this.assertOk(json, OP.BILLER_SEARCH);
    const plain = this.decryptResponse(json, OP.BILLER_SEARCH) as {
      list_of_search?: BillerRow[];
    };
    const list = plain?.list_of_search ?? [];
    const match =
      list.find(
        (b) => (b.biller_name ?? "").toLowerCase() === targetName
      ) ?? list.find((b) =>
        (b.biller_name ?? "").toLowerCase().includes(term)
      );

    if (match) {
      this.billerCache.set(targetName, match);
      return match;
    }
    return null;
  }

  /** Step 3: NLIBILLERS by billerid — returns authenticator field definitions */
  async loadBillerDetails(billerId: string): Promise<BillerRow> {
    const cached = this.billerDetailsCache.get(billerId);
    if (cached?.authenticators?.length) return cached;

    const json = await this.post(OP.BILLERS, { billerid: billerId });
    this.assertOk(json, `${OP.BILLERS}(billerid)`);
    const plain = this.decryptResponse(json, OP.BILLERS) as {
      BILLER?: BillerRow;
    };
    const biller = plain?.BILLER ?? (plain as BillerRow);
    this.billerDetailsCache.set(billerId, biller);
    return biller;
  }


  private buildAuthenticators(
    defs: BillerAuthenticator[],
    mobile: string,
    last4: string
  ): { parameter_name: string; value: string; encryption_required: string }[] {
    const out: {
      parameter_name: string;
      value: string;
      encryption_required: string;
    }[] = [];

    for (const def of defs) {
      const pname = def.parameter_name.toLowerCase();
      let value = "";
      if (pname.includes("registered") && pname.includes("mobile")) {
        value = mobile;
      } else if (
        (pname.includes("last") && pname.includes("4")) ||
        /last\s*4.*card/i.test(pname)
      ) {
        value = last4;
      } else if (
        pname.includes("mobile") &&
        !pname.includes("customer") &&
        !pname.includes("email")
      ) {
        value = mobile;
      } else if (def.value) {
        value = def.value;
      }
      if (!value && def.optional !== "Y") {
        throw new Error(`Missing value for authenticator: ${def.parameter_name}`);
      }
      if (value) {
        out.push({
          parameter_name: def.parameter_name,
          value,
          encryption_required: def.encryption_required ?? "N",
        });
      }
    }

    return out;
  }

  /**
   * Step 4: NLIVALIDATEPAYMENT — fetch bill (Pre Login flow).
   */
  async fetchBill(params: {
    bank: string;
    mobile: string;
    last4: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<BillFetchResult> {
    let billerRow: BillerRow | null = null;
    try {
      billerRow = await this.searchBiller(params.bank);
    } catch (e) {
      return {
        status: "FAILED",
        error: e instanceof Error ? e.message : "Biller search failed",
      };
    }
    if (!billerRow) {
      return { status: "FAILED", error: `Biller not found for: ${params.bank}` };
    }

    const billerId = billerRow.biller_id ?? billerRow.billerid;
    if (!billerId) {
      return { status: "FAILED", error: "Missing biller id" };
    }

    let details: BillerRow;
    try {
      details = await this.loadBillerDetails(billerId);
    } catch (e) {
      return {
        status: "FAILED",
        error: e instanceof Error ? e.message : "Biller details failed",
      };
    }

    const authDefs = details.authenticators ?? [];
    if (!authDefs.length) {
      return { status: "FAILED", error: "No authenticators on biller" };
    }

    let authenticators;
    try {
      authenticators = this.buildAuthenticators(
        authDefs,
        params.mobile,
        params.last4
      );
    } catch (e) {
      return {
        status: "FAILED",
        error: e instanceof Error ? e.message : "Authenticator build failed",
      };
    }

    const validatePayload = {
      authenticators,
      device: {
        init_channel: "Internet",
        ip: "124.124.1.1",
        mac: "11-AC-58-21-1B-AA",
      },
      customer: {
        email: params.email ?? "",
        mobile: `${params.mobile}`,
        lastname: params.lastName ?? "",
        firstname: params.firstName ?? "",
      },
      risk: [
        {
          score_type: "TXNRISK",
          score_provider: this.scoreProvider,
          score_value: "030",
        },
        {
          score_type: "TXNRISK",
          score_provider: "BBPS",
          score_value: "030",
        },
      ],
      billerid: billerId,
    };

    const retryable = (msg: string) =>
      /unable to get bill|too many request|try again|biller/i.test(msg);
    const rateLimited = (msg: string) => /too many request/i.test(msg);

    let json: MbResponse;
    let lastMessage = "";
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Rate-limited responses need exponential back-off + a fresh session,
        // otherwise BillDesk keeps returning "Too many request" on the same SESSIONKEY.
        const waitMs = rateLimited(lastMessage)
          ? Math.min(30000, 6000 * Math.pow(2, attempt - 1))
          : 2500;
        await new Promise((r) => setTimeout(r, waitMs));
        if (rateLimited(lastMessage)) {
          try {
            await this.resetSession();
          } catch {
            // best-effort; if reset fails the retry will still run on the old session
          }
        }
      }
      try {
        json = await this.post(OP.VALIDATE_PAYMENT, validatePayload);
      } catch (e) {
        return {
          status: "FAILED",
          error: e instanceof Error ? e.message : "Validate payment failed",
        };
      }

      const statusCode = json.MB?.RS?.STATUSCODE;
      if (!statusCode || statusCode === "0") break;

      lastMessage = json.MB?.RS?.MESSAGE ?? `STATUSCODE ${statusCode}`;
      if (isNoDuesMessage(lastMessage)) {
        return { status: "NO_DUES", error: lastMessage };
      }
      if (attempt < maxAttempts - 1 && retryable(lastMessage)) continue;

      return {
        status: "FAILED",
        error: lastMessage,
      };
    }

    const statusCode = json!.MB?.RS?.STATUSCODE;
    if (statusCode && statusCode !== "0") {
      const msg = json!.MB?.RS?.MESSAGE ?? `STATUSCODE ${statusCode}`;
      if (isNoDuesMessage(msg)) {
        return { status: "NO_DUES", error: msg };
      }
      return {
        status: "FAILED",
        error: msg,
      };
    }

    const plain = this.decryptResponse(json!, OP.VALIDATE_PAYMENT);
    return parseBillFromPlaintext(plain);
  }

  /** Decrypted NLIVALIDATEPAYMENT payload (for debugging parsers) */
  async fetchBillRaw(params: {
    bank: string;
    mobile: string;
    last4: string;
  }): Promise<unknown> {
    const result = await this.fetchBill(params);
    if (result.status !== "FAILED" || !result.error?.includes("parse")) {
      return { parsed: result };
    }
    await this.init();
    const billerRow = await this.searchBiller(params.bank);
    if (!billerRow) return { error: "no biller" };
    const billerId = billerRow.biller_id ?? billerRow.billerid;
    if (!billerId) return { error: "no biller id" };
    const details = await this.loadBillerDetails(billerId);
    const authenticators = this.buildAuthenticators(
      details.authenticators ?? [],
      params.mobile,
      params.last4
    );
    const json = await this.post(OP.VALIDATE_PAYMENT, {
      authenticators,
      device: {
        init_channel: "Internet",
        ip: "124.124.1.1",
        mac: "11-AC-58-21-1B-AA",
      },
      customer: {
        email: "",
        mobile: `${params.mobile}`,
        lastname: "",
        firstname: "",
      },
      risk: [
        {
          score_type: "TXNRISK",
          score_provider: this.scoreProvider,
          score_value: "030",
        },
        {
          score_type: "TXNRISK",
          score_provider: "BBPS",
          score_value: "030",
        },
      ],
      billerid: billerId,
    });
    return this.decryptResponse(json, OP.VALIDATE_PAYMENT);
  }

  /** Full flow for one card */
  async fetchBillForCard(card: {
    bank: string;
    mobile: string;
    last4: string;
    email?: string;
  }): Promise<BillFetchResult> {
    await this.init();
    return this.fetchBill(card);
  }
}

export async function fetchBillForCard(card: {
  bank: string;
  mobile: string;
  last4: string;
  email?: string;
}): Promise<BillFetchResult> {
  const client = new BillDeskClient();
  return client.fetchBillForCard(card);
}
