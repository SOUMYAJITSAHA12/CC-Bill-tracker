import type { Bill } from "@/lib/types";

export type CardBillStatus =
  | "overdue"
  | "due"
  | "partial"
  | "paid"
  | "no_dues"
  | "not_fetched";

export type CardBillSummary = {
  status: CardBillStatus;
  amount: number | null;
  dueDate: string | null;
  label: string;
};

export type LatestFetchLog = {
  status: string;
  amount?: number;
  error?: string | null;
  fetched_at?: string;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDue(due: string): Date {
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d;
}

function billRemaining(b: Bill): number {
  return Math.max(0, Number(b.amount) - Number(b.amount_paid ?? 0));
}

export function summarizeCardBill(
  cardId: string,
  bills: Bill[],
  latestFetch?: LatestFetchLog | null
): CardBillSummary {
  const cardBills = bills.filter((b) => b.card_id === cardId);
  const unpaid = cardBills.filter((b) => b.status === "UNPAID");
  const partial = cardBills.filter((b) => b.status === "PARTIAL");
  const today = startOfToday();

  if (latestFetch?.status === "NO_DUES") {
    return {
      status: "no_dues",
      amount: 0,
      dueDate: null,
      label: "No due",
    };
  }

  if (unpaid.length > 0) {
    const amount = unpaid.reduce((s, b) => s + Number(b.amount), 0);
    const hasOverdue = unpaid.some((b) => parseDue(b.due_date) < today);
    const nearest = unpaid.map((b) => b.due_date).sort()[0];
    return {
      status: hasOverdue ? "overdue" : "due",
      amount,
      dueDate: nearest ?? null,
      label: hasOverdue ? "Overdue" : "Bill due",
    };
  }

  if (partial.length > 0) {
    const amount = partial.reduce((s, b) => s + billRemaining(b), 0);
    const hasOverdue = partial.some((b) => parseDue(b.due_date) < today);
    const nearest = partial.map((b) => b.due_date).sort()[0];
    return {
      status: "partial",
      amount,
      dueDate: nearest ?? null,
      label: hasOverdue ? "Partial (overdue)" : "Partial paid",
    };
  }

  const paid = cardBills.filter((b) => b.status === "PAID");
  if (paid.length > 0) {
    const latestPaid = paid
      .map((b) => b.paid_at ?? b.created_at)
      .sort()
      .reverse()[0];
    return {
      status: "paid",
      amount: 0,
      dueDate: latestPaid?.slice(0, 10) ?? null,
      label: "Paid",
    };
  }

  if (cardBills.length === 0 && !latestFetch) {
    return {
      status: "not_fetched",
      amount: null,
      dueDate: null,
      label: "Not fetched",
    };
  }

  return {
    status: "no_dues",
    amount: 0,
    dueDate: null,
    label: "No due",
  };
}

/** Row background — apply to `<tr>` and every `<td>` */
export function statusRowClass(status: CardBillStatus): string {
  switch (status) {
    case "overdue":
      return "bg-[var(--row-overdue)] hover:bg-[color-mix(in_srgb,var(--row-overdue)_85%,var(--danger)_15%)]";
    case "due":
      return "bg-[var(--row-due)] hover:bg-[color-mix(in_srgb,var(--row-due)_85%,var(--warn)_15%)]";
    case "partial":
      return "bg-[color-mix(in_srgb,var(--row-due)_50%,var(--ok)_50%)] hover:opacity-95";
    case "paid":
      return "bg-[var(--row-paid)] hover:bg-[color-mix(in_srgb,var(--row-paid)_85%,var(--ok)_15%)]";
    case "no_dues":
      return "bg-[var(--row-no-dues)]";
    default:
      return "bg-[var(--row-not-fetched)]";
  }
}

/** Left accent bar — apply to first `<td>` only (inset shadow on `<tr>` breaks table layout). */
export function statusRowAccent(status: CardBillStatus): string {
  switch (status) {
    case "overdue":
      return "border-l-4 border-l-[var(--danger)]";
    case "due":
      return "border-l-4 border-l-[var(--warn)]";
    case "partial":
      return "border-l-4 border-l-[var(--warn)]";
    case "paid":
      return "border-l-4 border-l-[var(--ok)]";
    case "no_dues":
      return "border-l-4 border-l-[var(--muted)]";
    default:
      return "border-l-4 border-l-[var(--border)]";
  }
}

export function statusBadgeClass(status: CardBillStatus): string {
  switch (status) {
    case "overdue":
      return "bg-[var(--danger)]/20 text-[var(--danger)]";
    case "due":
      return "bg-[var(--warn)]/20 text-[var(--warn)]";
    case "partial":
      return "bg-[color-mix(in_srgb,var(--warn)_25%,var(--ok)_25%)] text-[var(--warn)]";
    case "paid":
      return "bg-[var(--ok)]/20 text-[var(--ok)]";
    case "no_dues":
      return "bg-[var(--muted)]/20 text-[var(--muted)]";
    default:
      return "bg-[var(--border)]/40 text-[var(--muted)]";
  }
}

export function statusAmountClass(status: CardBillStatus): string {
  switch (status) {
    case "overdue":
      return "text-[var(--danger)] font-semibold";
    case "due":
      return "text-[var(--warn)] font-semibold";
    case "partial":
      return "text-[var(--warn)] font-semibold";
    case "paid":
      return "text-[var(--ok)]";
    case "no_dues":
      return "text-[var(--muted)]";
    default:
      return "text-[var(--muted)]";
  }
}
