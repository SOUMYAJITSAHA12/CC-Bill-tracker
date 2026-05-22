/** Credit-card bill pay VPAs (mobile + last4 only — never full card number). */

export type CreditCardUpiIssuer = "axis" | "icici";

export type CreditCardUpiInfo = {
  issuer: CreditCardUpiIssuer;
  vpa: string;
  upiUrl: string;
  /** Human-readable formula for the issuer */
  format: string;
};

const ISSUERS: CreditCardUpiIssuer[] = ["axis", "icici"];

export function supportsCreditCardUpi(bank: string): boolean {
  return ISSUERS.includes(bank.toLowerCase() as CreditCardUpiIssuer);
}

/** 10-digit registered mobile (strips leading 91 if present). */
export function normalizeRegisteredMobile(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

export function normalizeCardLast4(last4: string): string | null {
  const d = last4.replace(/\D/g, "").slice(-4);
  return d.length === 4 ? d : null;
}

/**
 * Official card-linked UPI VPAs:
 * - Axis: cc.91{RMN}{last4}@axisbank
 * - ICICI: ccpay.{RMN}{last4}@icici
 */
export function creditCardUpiVpa(
  bank: string,
  mobile: string,
  last4: string
): string | null {
  const rm = normalizeRegisteredMobile(mobile);
  const l4 = normalizeCardLast4(last4);
  if (!rm || !l4) return null;

  const b = bank.toLowerCase();
  if (b === "axis") return `cc.91${rm}${l4}@axisbank`;
  if (b === "icici") return `ccpay.${rm}${l4}@icici`;
  return null;
}

/**
 * UPI pay URL with VPA + currency only. Name and amount are intentionally
 * omitted so the user enters the amount in their UPI app at pay time.
 */
export function buildUpiPayUrl(params: { vpa: string }): string {
  const q = new URLSearchParams();
  q.set("pa", params.vpa);
  q.set("cu", "INR");
  return `upi://pay?${q.toString()}`;
}

export function creditCardUpiInfo(
  bank: string,
  mobile: string,
  last4: string
): CreditCardUpiInfo | null {
  const vpa = creditCardUpiVpa(bank, mobile, last4);
  if (!vpa) return null;

  const issuer = bank.toLowerCase() as CreditCardUpiIssuer;
  const format =
    issuer === "axis"
      ? "cc.91{10-digit mobile}{last4}@axisbank"
      : "ccpay.{10-digit mobile}{last4}@icici";

  return {
    issuer,
    vpa,
    format,
    upiUrl: buildUpiPayUrl({ vpa }),
  };
}
