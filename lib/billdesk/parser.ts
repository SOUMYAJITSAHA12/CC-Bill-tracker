import type { BillFetchResult } from "@/lib/types";
import { isNoDuesMessage, normalizeFetchResult } from "./no-dues";

type PaymentBill = {
  billamount?: string | number;
  net_billamount?: string | number;
  billduedate?: string;
  billdate?: string;
  billnumber?: string;
  billperiod?: string;
  billstatus?: string;
  payment_amount?: string | number;
  additional_details?: { label?: string; value?: string }[];
};

function hasStructuredBill(bill: PaymentBill): boolean {
  return Boolean(
    bill.billnumber ||
      bill.billduedate ||
      bill.billdate ||
      bill.billstatus
  );
}

function parseAmount(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

/** BoB and others put payable amount in additional_details when billamount is 0 or negative */
function amountFromAdditionalDetails(
  extras?: { label?: string; value?: string }[]
): number {
  if (!extras?.length) return 0;

  const priority = [
    /current\s*outstanding/i,
    /total\s*amount\s*due/i,
    /total\s*due/i,
    /amount\s*due/i,
    /statement\s*amount/i,
    /outstanding\s*amount/i,
  ];

  for (const re of priority) {
    const row = extras.find((d) => re.test(d.label ?? ""));
    if (row?.value) {
      const n = parseAmount(row.value);
      if (n > 0) return n;
    }
  }

  let max = 0;
  for (const d of extras) {
    if (/unbilled/i.test(d.label ?? "")) continue;
    const n = parseAmount(d.value);
    if (n > max) max = n;
  }
  return max;
}

export function parseBillFromPlaintext(data: unknown): BillFetchResult {
  if (!data || typeof data !== "object") {
    return parseBillFromText(typeof data === "string" ? data : "");
  }

  const root = data as Record<string, unknown>;
  const payment = (root.PAYMENT ?? root.payment) as
    | Record<string, unknown>
    | undefined;

  if (payment) {
    const billlist = (payment.billlist ?? payment.BILLLIST) as
      | PaymentBill[]
      | undefined;
    const bill = (
      billlist?.[0] ??
      payment.bill ??
      payment.BILL ??
      payment
    ) as PaymentBill;

    const extras = bill.additional_details;
    let amount = parseAmount(
      (bill.billamount ?? bill.net_billamount ?? payment.payment_amount) as
        | string
        | number
        | undefined
    );
    if (amount <= 0) {
      amount = amountFromAdditionalDetails(extras);
    }
    const due = normalizeBilldeskDate(
      String(bill.billduedate ?? payment.billduedate ?? "")
    );
    const billDate = normalizeBilldeskDate(
      String(bill.billdate ?? payment.billdate ?? "")
    );

    let min_due = 0;
    if (extras) {
      const minRow = extras.find((d) => /minimum/i.test(d.label ?? ""));
      if (minRow?.value) min_due = parseAmount(minRow.value);
    }

    if (amount > 0) {
      return {
        status: "FETCHED",
        amount,
        due_date: due || undefined,
        bill_date: billDate || new Date().toISOString().slice(0, 10),
        min_due: min_due || undefined,
      };
    }

    // Kotak and others return billlist with ₹0 when nothing is payable
    if (hasStructuredBill(bill)) {
      const status = String(bill.billstatus ?? "").toUpperCase();
      if (status === "PAID" || amount <= 0) {
        return {
          status: "NO_DUES",
          due_date: due || undefined,
          bill_date: billDate || undefined,
          amount: 0,
        };
      }
    }
  }

  return normalizeFetchResult(parseBillFromText(JSON.stringify(data)));
}

function parseBillFromText(text: string): BillFetchResult {
  const lower = text.toLowerCase();

  if (isNoDuesMessage(text)) {
    return { status: "NO_DUES" };
  }

  let amount = 0;
  const amountMatch = text.match(
    /(?:bill\s*amount|billamount|amount\s*due|payment\s*amount)[:\s]*(?:rs\.?|₹|inr)?\s*([\d,]+\.?\d*)/i
  );
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  }
  if (!amount) {
    const rs = text.match(/(?:Rs\.?|₹|INR)\s*([\d,]+\.?\d*)/i);
    if (rs) amount = parseFloat(rs[1].replace(/,/g, ""));
  }

  let due_date = "";
  const dueMatch = text.match(
    /(?:due\s*date|billduedate)[:\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i
  );
  if (dueMatch) due_date = normalizeBilldeskDate(dueMatch[1]);

  let bill_date = "";
  const billMatch = text.match(
    /(?:bill\s*date|billdate)[:\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i
  );
  if (billMatch) bill_date = normalizeBilldeskDate(billMatch[1]);

  if (amount > 0) {
    return {
      status: "FETCHED",
      amount,
      due_date: due_date || undefined,
      bill_date: bill_date || new Date().toISOString().slice(0, 10),
    };
  }

  if (/invalid|not\s*found|unable|try\s*again|went\s*wrong/i.test(lower)) {
    return { status: "FAILED", error: "Portal rejected request" };
  }

  return { status: "FAILED", error: "Could not parse bill from response" };
}

/** BillDesk dates often DD-MM-YYYY */
function normalizeBilldeskDate(raw: string): string {
  if (!raw) return "";
  const dmy = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}
