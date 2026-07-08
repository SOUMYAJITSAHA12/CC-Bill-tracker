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

/**
 * Live account balance ("Current Outstanding") from additional_details.
 * Priority:
 *   1. Explicit "Current Outstanding [Amount]" / "Outstanding Amount" row.
 *   2. Computed as max(billamount, Total Amount Due, 0) + Unbilled Amount
 *      when the portal doesn't send it explicitly (e.g. SBM).
 * Returns undefined when no signal is available at all.
 */
function extractOutstanding(
  bill: PaymentBill
): number | undefined {
  const extras = bill.additional_details;
  if (!extras?.length) {
    // Fall back to the statement itself as a last-resort estimate.
    const stmt = parseAmount(
      (bill.billamount ?? bill.net_billamount) as string | number | undefined
    );
    return stmt > 0 ? stmt : undefined;
  }

  const explicit = extras.find((d) =>
    /^\s*current\s*outstanding(?:\s*amount)?\s*$|^\s*outstanding\s*amount\s*$/i.test(
      d.label ?? ""
    )
  );
  if (explicit?.value !== undefined && explicit.value !== "") {
    const n = parseAmount(explicit.value);
    if (!Number.isNaN(n)) return n;
  }

  const totalDue = extras.find((d) =>
    /^\s*(?:total\s*amount\s*due|amount\s*due|total\s*due|total\s*payable|net\s*amount\s*due)\s*$/i.test(
      d.label ?? ""
    )
  );
  const unbilled = extras.find((d) => /unbilled/i.test(d.label ?? ""));

  const stmtAmount = parseAmount(
    (bill.billamount ?? bill.net_billamount) as string | number | undefined
  );
  const totalDueVal = totalDue?.value ? parseAmount(totalDue.value) : NaN;
  const base = Math.max(
    Number.isNaN(totalDueVal) ? 0 : totalDueVal,
    stmtAmount > 0 ? stmtAmount : 0
  );
  const unbilledVal = unbilled?.value ? parseAmount(unbilled.value) : 0;

  const computed = base + unbilledVal;
  if (computed > 0 || totalDue || unbilled) return computed;
  return undefined;
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

    // Only `billamount` / `net_billamount` / `payment_amount` are the actual
    // billed statement amount. Fields like "Current Outstanding Amount" in
    // `additional_details` represent the LIVE running balance (statement +
    // unbilled post-statement spends − credits). Treating them as a bill would
    // inflate the due amount and show a bill when nothing is actually payable
    // (e.g. BoB with a credit balance, HSBC after full payment, ICICI where
    // the new statement hasn't been generated yet).
    const amount = parseAmount(
      (bill.billamount ?? bill.net_billamount ?? payment.payment_amount) as
        | string
        | number
        | undefined
    );
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

    const outstanding = extractOutstanding(bill);

    // Some billers (e.g. SBM Bank India / Kreditpe) leave `billamount` at the
    // ORIGINAL statement amount even after the customer pays through another
    // channel, and reflect the real balance in additional_details."Total Amount
    // Due" (or "Amount Due" / "Total Due"). If that authoritative field is
    // explicitly 0, the cycle is settled — return NO_DUES regardless of what
    // billamount says. We deliberately DO NOT match "Minimum Amount Due",
    // "Current Outstanding", or "Unbilled Amount" here.
    if (extras) {
      const authRow = extras.find((d) =>
        /^\s*(?:total\s*amount\s*due|amount\s*due|total\s*due|total\s*payable|net\s*amount\s*due)\s*$/i.test(
          d.label ?? ""
        )
      );
      if (authRow?.value !== undefined && authRow.value !== "") {
        if (parseAmount(authRow.value) === 0) {
          return {
            status: "NO_DUES",
            due_date: due || undefined,
            bill_date: billDate || undefined,
            amount: 0,
            outstanding,
          };
        }
      }
    }

    if (amount > 0) {
      return {
        status: "FETCHED",
        amount,
        due_date: due || undefined,
        bill_date: billDate || new Date().toISOString().slice(0, 10),
        min_due: min_due || undefined,
        outstanding,
      };
    }

    // billamount ≤ 0 with a real bill row = nothing payable this cycle
    // (credit balance, zeroed net after adjustments, or PAID status).
    if (hasStructuredBill(bill)) {
      return {
        status: "NO_DUES",
        due_date: due || undefined,
        bill_date: billDate || undefined,
        amount: 0,
        outstanding,
      };
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
