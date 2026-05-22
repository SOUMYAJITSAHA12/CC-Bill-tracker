"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANK_BILLER_MAP } from "@/lib/banks";
import { noDuesDisplayMessage } from "@/lib/billdesk/no-dues";
import {
  summarizeCardBill,
  statusAmountClass,
  statusBadgeClass,
  statusRowAccent,
  statusRowClass,
  type CardBillStatus,
  type LatestFetchLog,
} from "@/lib/card-bill-status";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Bill, Card, CardProfile } from "@/lib/types";
import { creditCardUpiInfo, supportsCreditCardUpi } from "@/lib/upi-vpa";
import { CardForm } from "./CardForm";
import { Spinner } from "./Spinner";
import { UpiPayDialog } from "./UpiPayDialog";

function formatInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function Dashboard() {
  const [cards, setCards] = useState<Card[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [profiles, setProfiles] = useState<CardProfile[]>([]);
  // Column-header filters for the Cards table. Each filter is "all" by default
  // and only affects the cards table — overall stats / open bills always show
  // the full picture so totals stay meaningful regardless of what's filtered.
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<CardBillStatus | "all">("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchingCardId, setFetchingCardId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [formMode, setFormMode] = useState<"closed" | "add" | "edit">("closed");
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [latestFetchByCard, setLatestFetchByCard] = useState<
    Record<string, LatestFetchLog>
  >({});
  const [fetchProgress, setFetchProgress] = useState<{
    total: number;
    done: number;
    current: string | null;
    failures: { nickname: string; error: string }[];
  } | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      // Full reload so the server middleware sees the cleared cookies and
      // redirects to /login on the next render.
      window.location.href = "/login";
    }
  }

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const [cRes, bRes, pRes, fRes] = await Promise.all([
      fetch("/api/cards"),
      fetch("/api/bills"),
      fetch("/api/profiles"),
      fetch("/api/fetch/latest"),
    ]);
    const cJson = await cRes.json();
    const bJson = await bRes.json();
    const pJson = await pRes.json();
    const fJson = await fRes.json();
    if (cRes.ok) setCards(cJson.cards ?? []);
    if (bRes.ok) setBills(bJson.bills ?? []);
    if (pRes.ok) setProfiles(pJson.profiles ?? []);
    if (fRes.ok) setLatestFetchByCard(fJson.latestByCard ?? {});
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Stats / open bills always reflect the full data set so the user can see
  // their overall position regardless of which column-header filters are
  // applied to the Cards table.
  const filteredCardIds = useMemo(
    () => new Set(cards.map((c) => c.id)),
    [cards]
  );

  // List of unique bank codes actually used by the user's cards — feeds the
  // Bank column-header filter dropdown.
  const bankOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const c of cards) if (c.bank) seen.add(c.bank);
    return [...seen].sort();
  }, [cards]);

  /**
   * Final list rendered in the Cards table after applying ALL column-header
   * filters (status, profile, bank). Computed by re-running the bill summary
   * per card, which is unavoidable when filtering by computed status.
   */
  const tableCards = useMemo(() => {
    return cards.filter((c) => {
      if (profileFilter === "none" && c.profile_id) return false;
      if (
        profileFilter !== "all" &&
        profileFilter !== "none" &&
        c.profile_id !== profileFilter
      )
        return false;
      if (bankFilter !== "all" && c.bank !== bankFilter) return false;
      if (statusFilter !== "all") {
        const summary = summarizeCardBill(c.id, bills, latestFetchByCard[c.id]);
        if (summary.status !== statusFilter) return false;
      }
      return true;
    });
  }, [cards, bills, latestFetchByCard, profileFilter, statusFilter, bankFilter]);

  function clearAllFilters() {
    setProfileFilter("all");
    setStatusFilter("all");
    setBankFilter("all");
  }

  const openBills = useMemo(
    () =>
      bills.filter(
        (b) =>
          (b.status === "UNPAID" || b.status === "PARTIAL") &&
          filteredCardIds.has(b.card_id)
      ),
    [bills, filteredCardIds]
  );

  const openCycleKeys = useMemo(
    () => new Set(openBills.map((b) => `${b.card_id}:${b.due_date}`)),
    [openBills]
  );

  const cardsWithOpenBills = useMemo(
    () => new Set(openBills.map((b) => b.card_id)),
    [openBills]
  );

  /** Latest PAID bill per card — only when that card has no open bill */
  const latestPaidBillByCard = useMemo(() => {
    const map = new Map<string, Bill>();
    for (const b of bills) {
      if (b.status !== "PAID" || !filteredCardIds.has(b.card_id)) continue;
      if (cardsWithOpenBills.has(b.card_id)) continue;
      const existing = map.get(b.card_id);
      const at = b.paid_at ?? b.created_at;
      const existingAt = existing?.paid_at ?? existing?.created_at ?? "";
      if (!existing || at > existingAt) map.set(b.card_id, b);
    }
    return map;
  }, [bills, filteredCardIds, cardsWithOpenBills]);

  const recentPaidBills = useMemo(() => {
    const seen = new Set<string>();
    return bills
      .filter((b) => b.status === "PAID" && filteredCardIds.has(b.card_id))
      .filter((b) => !openCycleKeys.has(`${b.card_id}:${b.due_date}`))
      .sort(
        (a, b) =>
          new Date(b.paid_at ?? b.created_at).getTime() -
          new Date(a.paid_at ?? a.created_at).getTime()
      )
      .filter((b) => {
        const key = `${b.card_id}:${b.due_date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [bills, filteredCardIds, openCycleKeys]);

  const billRemaining = (b: Bill) =>
    Math.max(0, Number(b.amount) - Number(b.amount_paid ?? 0));

  const unpaidTotal = useMemo(
    () => openBills.reduce((sum, b) => sum + billRemaining(b), 0),
    [openBills]
  );

  const overdue = openBills.filter((b) => new Date(b.due_date) < new Date());
  const dueSoon = openBills.filter((b) => {
    const d = new Date(b.due_date);
    const now = new Date();
    const diff = (d.getTime() - now.getTime()) / (86400000);
    return diff >= 0 && diff <= 7;
  });

  /**
   * Builds the post-fetch summary line shown in the message banner.
   *
   * Per UX feedback (May 2026): only failed records are listed inline. Totals
   * (fetched / no dues / failed / already paid) are still shown so the user
   * knows nothing was silently skipped, but successful + no-due + paid cards
   * are no longer enumerated — they were just noise.
   */
  function buildFetchSummary(s: {
    fetched?: number;
    failed?: number;
    no_dues?: number;
    skipped_paid?: number;
    details?: {
      nickname: string;
      status: string;
      error?: string;
      amount?: number;
      due_date?: string;
      portal_amount?: number;
    }[];
  }) {
    const details = s.details ?? [];
    const failedCards = details.filter((d) => d.status === "FAILED");
    const header =
      `Fetched: ${s.fetched ?? 0}, no dues: ${s.no_dues ?? 0}, failed: ${s.failed ?? 0}` +
      ((s.skipped_paid ?? 0) > 0 ? `, already paid: ${s.skipped_paid}` : "");

    if (failedCards.length === 0) {
      return `${header} · All cards completed without errors`;
    }
    const failureLines = failedCards.map(
      (d) => `${d.nickname}: ${d.error ?? d.status}`
    );
    return [header, ...failureLines].join(" · ");
  }

  function formatSkippedPaidMessage(
    nickname: string,
    portalAmount?: number,
    dueDate?: string
  ) {
    const amt =
      portalAmount != null && portalAmount > 0
        ? ` (bank still shows ${formatInr(portalAmount)}`
        : "";
    const due = dueDate ? ` for due ${dueDate}` : "";
    return `${nickname}: already marked paid${due}${amt ? `${amt})` : ""} — ignored`;
  }

  /**
   * Fetch all bills by consuming the NDJSON stream from /api/fetch/stream.
   * Each line is a progress event we use to update the inline progress bar.
   * The final "complete" event carries the summary that we collapse to a
   * failed-only message (totals + only the cards that errored).
   */
  async function triggerFetch() {
    setFetching(true);
    setMessage("");
    setFetchProgress({ total: 0, done: 0, current: null, failures: [] });

    type ProgressEvent =
      | {
          type: "start";
          total: number;
          lanes: { biller: string; cards: { nickname: string }[] }[];
        }
      | { type: "card_start"; nickname: string; done: number; total: number }
      | {
          type: "card_done";
          outcome: {
            nickname: string;
            status: string;
            error?: string;
          };
          done: number;
          total: number;
        }
      | {
          type: "complete";
          summary: {
            fetched?: number;
            failed?: number;
            no_dues?: number;
            skipped_paid?: number;
            details?: {
              nickname: string;
              status: string;
              error?: string;
              amount?: number;
              due_date?: string;
              portal_amount?: number;
            }[];
          };
        }
      | { type: "error"; message: string };

    let finalSummary: Extract<ProgressEvent, { type: "complete" }>["summary"] | null = null;
    let streamError: string | null = null;

    try {
      const res = await fetch("/api/fetch/stream", { method: "POST" });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        let parsed: { error?: string } = {};
        try {
          parsed = JSON.parse(txt) as { error?: string };
        } catch {
          // not JSON
        }
        setMessage(parsed.error ?? "Fetch failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nl = buffer.indexOf("\n");
        while (nl !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) {
            try {
              const event = JSON.parse(line) as ProgressEvent;
              applyProgressEvent(event);
              if (event.type === "complete") finalSummary = event.summary;
              if (event.type === "error") streamError = event.message;
            } catch {
              // ignore malformed line — stream is still useful
            }
          }
          nl = buffer.indexOf("\n");
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        try {
          const event = JSON.parse(trailing) as ProgressEvent;
          applyProgressEvent(event);
          if (event.type === "complete") finalSummary = event.summary;
          if (event.type === "error") streamError = event.message;
        } catch {
          // ignore
        }
      }
    } catch (e) {
      streamError = e instanceof Error ? e.message : "Fetch stream failed";
    } finally {
      setFetching(false);
      setFetchProgress(null);
    }

    if (streamError && !finalSummary) {
      setMessage(streamError);
    } else if (finalSummary) {
      setMessage(buildFetchSummary(finalSummary));
    } else {
      setMessage("Fetch finished");
    }

    load();

    function applyProgressEvent(event: ProgressEvent) {
      setFetchProgress((prev) => {
        const base = prev ?? { total: 0, done: 0, current: null, failures: [] };
        if (event.type === "start") {
          return { total: event.total, done: 0, current: null, failures: [] };
        }
        if (event.type === "card_start") {
          return {
            ...base,
            total: event.total || base.total,
            done: event.done,
            current: event.nickname,
          };
        }
        if (event.type === "card_done") {
          const failures =
            event.outcome.status === "FAILED"
              ? [
                  ...base.failures,
                  {
                    nickname: event.outcome.nickname,
                    error: event.outcome.error ?? event.outcome.status,
                  },
                ]
              : base.failures;
          return {
            ...base,
            total: event.total || base.total,
            done: event.done,
            current: null,
            failures,
          };
        }
        if (event.type === "complete") {
          return { ...base, done: base.total, current: null };
        }
        return base;
      });
    }
  }

  const [payDialogBill, setPayDialogBill] = useState<Bill | null>(null);
  const [upiDialog, setUpiDialog] = useState<{
    nickname: string;
    bankLabel: string;
    issuer: "axis" | "icici";
    vpa: string;
    upiUrl: string;
    format: string;
    amount?: number;
  } | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    kind: "paid_full" | "paid_partial" | "unmark";
    bill: Bill;
    partialAmount?: number;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function submitPayment(
    billId: string,
    payload:
      | { status: "PAID" }
      | { status: "PARTIAL"; amount_paid: number }
      | { status: "UNPAID" }
  ) {
    if (!billId) {
      setMessage("Missing bill id — refresh the page and try again");
      return false;
    }
    try {
      const res = await fetch(`/api/bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: { error?: string; ok?: boolean } = {};
      try {
        json = await res.json();
      } catch {
        json = { error: "Invalid response from server" };
      }
      if (!res.ok) {
        setMessage(json.error ?? "Could not update bill");
        return false;
      }
      setPayDialogBill(null);
      setPartialAmount("");
      setConfirmAction(null);
      await load();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Network error updating bill");
      return false;
    }
  }

  function openPayDialog(bill: Bill) {
    setPayDialogBill(bill);
    setPartialAmount("");
    setConfirmAction(null);
  }

  function openUpiPay(card: Card, amount?: number) {
    const info = creditCardUpiInfo(card.bank, card.mobile, card.last4);
    if (!info) {
      setMessage(
        "UPI pay is only available for Axis and ICICI cards with valid mobile + last 4"
      );
      return;
    }
    setUpiDialog({
      nickname: card.nickname,
      bankLabel: BANK_BILLER_MAP[card.bank]?.name ?? card.bank,
      issuer: info.issuer,
      vpa: info.vpa,
      upiUrl: info.upiUrl,
      format: info.format,
      amount,
    });
  }

  const cardById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards]
  );

  function requestConfirm(
    kind: "paid_full" | "paid_partial" | "unmark",
    bill: Bill,
    partialAmt?: number
  ) {
    setConfirmAction({ kind, bill, partialAmount: partialAmt });
    setPayDialogBill(null);
    setPartialAmount("");
  }

  async function executeConfirm() {
    if (!confirmAction || confirming) return;
    const { kind, bill, partialAmount: partialAmt } = confirmAction;
    const billId = bill.id;
    const name = bill.cards?.nickname ?? "Card";

    setConfirming(true);
    try {
      let ok = false;
      if (kind === "unmark") {
        ok = await submitPayment(billId, { status: "UNPAID" });
        if (ok) setMessage(`${name}: marked unpaid again`);
      } else if (kind === "paid_full") {
        ok = await submitPayment(billId, { status: "PAID" });
        if (ok) setMessage(`${name}: marked paid in full`);
      } else if (kind === "paid_partial" && partialAmt != null) {
        const newPaid = Number(bill.amount_paid ?? 0) + partialAmt;
        if (newPaid >= Number(bill.amount) - 0.01) {
          ok = await submitPayment(billId, { status: "PAID" });
          if (ok) setMessage(`${name}: marked paid in full`);
        } else {
          ok = await submitPayment(billId, {
            status: "PARTIAL",
            amount_paid: newPaid,
          });
          if (ok) {
            setMessage(`${name}: partial payment ${formatInr(partialAmt)} recorded`);
          }
        }
      } else {
        setMessage("Could not complete payment — try again");
      }
    } finally {
      setConfirming(false);
    }
  }

  function confirmTitle() {
    if (!confirmAction) return "";
    const name = confirmAction.bill.cards?.nickname ?? "Card";
    const due = confirmAction.bill.due_date;
    const total = formatInr(Number(confirmAction.bill.amount));
    if (confirmAction.kind === "unmark") {
      return `Unmark ${name} as paid?`;
    }
    if (confirmAction.kind === "paid_full") {
      return `Mark ${name} as paid in full?`;
    }
    return `Record partial payment?`;
  }

  function confirmBody() {
    if (!confirmAction) return null;
    const name = confirmAction.bill.cards?.nickname ?? "Card";
    const due = confirmAction.bill.due_date;
    const total = formatInr(Number(confirmAction.bill.amount));
    if (confirmAction.kind === "unmark") {
      return (
        <p className="text-sm text-[var(--muted)]">
          {name} · due {due} · {total} will show as <strong>unpaid</strong> again.
          You can fetch from the bank to refresh the amount.
        </p>
      );
    }
    if (confirmAction.kind === "paid_full") {
      return (
        <p className="text-sm text-[var(--muted)]">
          {name} · due {due} · {total} will be marked <strong>paid in full</strong>.
          Re-fetch will not reopen this cycle unless the due date changes.
        </p>
      );
    }
    const amt = formatInr(confirmAction.partialAmount ?? 0);
    const newPaid =
      Number(confirmAction.bill.amount_paid ?? 0) +
      (confirmAction.partialAmount ?? 0);
    const remaining = Math.max(0, Number(confirmAction.bill.amount) - newPaid);
    return (
      <p className="text-sm text-[var(--muted)]">
        {name} · due {due} · record payment of <strong>{amt}</strong>
        {remaining > 0.01 ? (
          <>
            {" "}
            · <strong>{formatInr(remaining)}</strong> will remain due
          </>
        ) : (
          <> · bill will be marked <strong>paid in full</strong></>
        )}
      </p>
    );
  }

  function closeForm() {
    setFormMode("closed");
    setEditingCard(null);
  }

  function openAddForm() {
    setEditingCard(null);
    setFormMode("add");
  }

  function openEditForm(card: Card) {
    setEditingCard({ ...card });
    setFormMode("edit");
  }

  useEffect(() => {
    if (formMode === "closed") return;
    const t = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [formMode, editingCard?.id]);

  async function deleteCard(id: string) {
    if (!confirm("Deactivate this card?")) return;
    setDeletingCardId(id);
    try {
      await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (editingCard?.id === id) closeForm();
      await load();
    } finally {
      setDeletingCardId(null);
    }
  }

  function handleFormSaved() {
    closeForm();
    load();
  }

  function formatFetchMessage(outcome: {
    status: string;
    error?: string;
    amount?: number;
    due_date?: string;
    nickname?: string;
    portal_amount?: number;
  }) {
    if (outcome.status === "SKIPPED_PAID_CYCLE") {
      return `✓ ${formatSkippedPaidMessage(
        outcome.nickname ?? "Card",
        outcome.portal_amount ?? outcome.amount,
        outcome.due_date
      )}`;
    }
    if (outcome.status === "SKIPPED_PARTIAL_PORTAL") {
      return `${outcome.nickname ?? "Card"}: bank still shows full due (${formatInr(
        outcome.portal_amount ?? outcome.amount ?? 0
      )}) — kept your partial payment record`;
    }
    if (outcome.status === "FETCHED" && outcome.amount) {
      return `${outcome.nickname ?? "Card"}: ${formatInr(outcome.amount)} due ${outcome.due_date ?? "—"}`;
    }
    if (outcome.status === "NO_DUES") {
      return `${outcome.nickname ?? "Card"}: ${noDuesDisplayMessage(outcome.error)}`;
    }
    const err = outcome.error ?? "Fetch failed";
    if (/too many request/i.test(err)) {
      return `${outcome.nickname ?? "Card"}: ${err} — BillDesk rate limit; wait 1–2 min or fetch this card alone with "Fetch bill"`;
    }
    if (/unable to get bill/i.test(err)) {
      return `${outcome.nickname ?? "Card"}: ${err} — confirm mobile & last4 on the bank portal, wait ~30s, then retry`;
    }
    return `${outcome.nickname ?? "Card"}: ${err}`;
  }

  async function fetchOneCard(card: Card) {
    setFetchingCardId(card.id);
    setMessage("");
    const res = await fetch(`/api/cards/${card.id}/fetch`, { method: "POST" });
    const json = await res.json();
    setFetchingCardId(null);

    const outcome = json.outcome as {
      status: string;
      error?: string;
      amount?: number;
      due_date?: string;
      nickname?: string;
      portal_amount?: number;
    } | undefined;

    if (!res.ok) {
      setMessage(
        outcome
          ? formatFetchMessage({ ...outcome, nickname: card.nickname })
          : (json.error ?? "Fetch failed")
      );
      return;
    }

    setMessage(
      outcome
        ? formatFetchMessage({ ...outcome, nickname: card.nickname })
        : "Bill fetched"
    );
    load();
  }

  function profileLabel(card: Card) {
    return card.card_profiles?.name ?? "—";
  }

  function cardSummary(card: Card) {
    return summarizeCardBill(card.id, bills, latestFetchByCard[card.id]);
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8 min-w-0 overflow-x-hidden">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">CC Bill Tracker</h1>
          <p className="text-[var(--muted)] text-sm">
            BillDesk API · {cards.length} cards · {openBills.length} open ·{" "}
            {formatInr(unpaidTotal)} due
          </p>
          <p className="text-[var(--muted)] text-xs mt-1">
            Pick the correct bank when adding a card (not just nickname).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() =>
              formMode !== "closed" ? closeForm() : openAddForm()
            }
            className="px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--card)]"
          >
            {formMode !== "closed" ? "Close" : "Add card"}
          </button>
          <button
            type="button"
            onClick={triggerFetch}
            disabled={fetching || fetchingCardId !== null}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {fetching && <Spinner />}
            {fetching ? "Fetching all…" : "Fetch all bills"}
          </button>
          {currentUserEmail && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-[var(--border)]">
              <span
                className="text-xs text-[var(--muted)] truncate max-w-[160px]"
                title={currentUserEmail}
              >
                {currentUserEmail}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-[var(--card)] disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {signingOut && <Spinner size="xs" />}
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </header>

      {fetching && fetchProgress && (
        <div
          className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {fetchProgress.total === 0
                ? "Starting fetch…"
                : `Fetching bills · ${fetchProgress.done} of ${fetchProgress.total}`}
            </span>
            <span className="text-[var(--muted)] text-xs">
              {fetchProgress.current
                ? `Currently: ${fetchProgress.current}`
                : fetchProgress.total > 0 && fetchProgress.done < fetchProgress.total
                  ? "Waiting before next biller call…"
                  : ""}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg)] overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-300 ease-out"
              style={{
                width:
                  fetchProgress.total > 0
                    ? `${Math.min(100, (fetchProgress.done / fetchProgress.total) * 100)}%`
                    : "8%",
              }}
            />
          </div>
          {fetchProgress.failures.length > 0 && (
            <p className="text-xs text-[var(--danger)]">
              {fetchProgress.failures.length} failure
              {fetchProgress.failures.length === 1 ? "" : "s"} so far —
              {" "}
              {fetchProgress.failures
                .slice(-3)
                .map((f) => f.nickname)
                .join(", ")}
              {fetchProgress.failures.length > 3 ? ", …" : ""}
            </p>
          )}
        </div>
      )}

      {message && (
        <p className="text-sm p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] break-words">
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0">
        <Stat label="Unpaid amount" value={formatInr(unpaidTotal)} tone="ok" />
        <Stat label="Open bills" value={String(openBills.length)} tone="ok" />
        <Stat label="Overdue" value={String(overdue.length)} tone="danger" />
        <Stat label="Due ≤ 7 days" value={String(dueSoon.length)} tone="warn" />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Cards</h2>

        {formMode !== "closed" && (formMode === "add" || editingCard) && (
          <div ref={formRef} className="mb-6">
            <CardForm
              key={formMode === "edit" && editingCard ? editingCard.id : "new"}
              card={formMode === "edit" ? editingCard : null}
              profiles={profiles}
              onProfilesChange={setProfiles}
              onSaved={handleFormSaved}
              onCancel={closeForm}
            />
          </div>
        )}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
            <Spinner size="lg" className="text-brand-600" />
            <p className="text-sm">Loading your cards…</p>
          </div>
        ) : cards.length === 0 ? (
          <p className="text-[var(--muted)]">
            No cards yet. Add your first card.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] -mx-1 px-1">
            <table className="w-full min-w-[880px] text-sm border-collapse">
              <thead className="bg-[var(--card)] text-left text-[var(--muted)]">
                <tr>
                  <th className="p-3 pl-4 whitespace-nowrap align-bottom">
                    <div className="space-y-1">
                      <div>Status</div>
                      <select
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(
                            e.target.value as CardBillStatus | "all"
                          )
                        }
                        aria-label="Filter by status"
                        className="block w-full text-xs font-normal px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)]"
                      >
                        <option value="all">All</option>
                        <option value="overdue">Overdue</option>
                        <option value="due">Bill due</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="no_dues">No due</option>
                        <option value="not_fetched">Not fetched</option>
                      </select>
                    </div>
                  </th>
                  <th className="p-3 whitespace-nowrap align-bottom">Nickname</th>
                  <th className="p-3 whitespace-nowrap align-bottom">
                    <div className="space-y-1">
                      <div>Profile</div>
                      <select
                        value={profileFilter}
                        onChange={(e) => setProfileFilter(e.target.value)}
                        aria-label="Filter by profile"
                        className="block w-full text-xs font-normal px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)]"
                      >
                        <option value="all">All</option>
                        <option value="none">Unassigned</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="p-3 whitespace-nowrap align-bottom">
                    <div className="space-y-1">
                      <div>Bank</div>
                      <select
                        value={bankFilter}
                        onChange={(e) => setBankFilter(e.target.value)}
                        aria-label="Filter by bank"
                        className="block w-full text-xs font-normal px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)]"
                      >
                        <option value="all">All</option>
                        {bankOptions.map((b) => (
                          <option key={b} value={b}>
                            {BANK_BILLER_MAP[b]?.name ?? b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="p-3 whitespace-nowrap align-bottom">Last4</th>
                  <th className="p-3 text-right whitespace-nowrap align-bottom">Due amount</th>
                  <th className="p-3 whitespace-nowrap align-bottom">Due date</th>
                  <th className="p-3 text-right whitespace-nowrap align-bottom">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableCards.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-6 text-center text-sm text-[var(--muted)]"
                    >
                      No cards match the current filters.{" "}
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="text-brand-600 hover:underline"
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                ) : null}
                {tableCards.map((c) => {
                  const summary = cardSummary(c);
                  const rowBg = statusRowClass(summary.status);
                  const rowAccent = statusRowAccent(summary.status);
                  return (
                  <tr
                    key={c.id}
                    className={rowBg}
                  >
                    <td className={`p-3 pl-4 ${rowBg} ${rowAccent}`}>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(summary.status)}`}
                      >
                        {summary.label}
                      </span>
                    </td>
                    <td className={`p-3 ${rowBg}`}>{c.nickname}</td>
                    <td className={`p-3 ${rowBg}`}>{profileLabel(c)}</td>
                    <td className={`p-3 ${rowBg}`}>
                      {BANK_BILLER_MAP[c.bank]?.name ?? c.bank}
                    </td>
                    <td className={`p-3 ${rowBg}`}>****{c.last4}</td>
                    <td className={`p-3 text-right ${rowBg} ${statusAmountClass(summary.status)}`}>
                      {summary.amount != null && summary.amount > 0
                        ? formatInr(summary.amount)
                        : summary.status === "paid"
                          ? "—"
                          : summary.status === "no_dues"
                            ? "₹0"
                            : "—"}
                    </td>
                    <td className={`p-3 text-[var(--muted)] ${rowBg}`}>
                      {summary.dueDate ?? "—"}
                    </td>
                    <td className={`p-3 text-right space-x-2 whitespace-nowrap ${rowBg}`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditForm(c);
                        }}
                        className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg)] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => fetchOneCard(c)}
                        disabled={fetching || fetchingCardId !== null}
                        className="text-xs px-2 py-1 rounded border border-brand-600 text-brand-600 hover:bg-brand-600/10 disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {fetchingCardId === c.id && <Spinner size="xs" />}
                        {fetchingCardId === c.id ? "Fetching…" : "Fetch bill"}
                      </button>
                      {supportsCreditCardUpi(c.bank) && (
                        <button
                          type="button"
                          onClick={() => {
                            const amt =
                              summary.amount != null && summary.amount > 0
                                ? summary.amount
                                : undefined;
                            openUpiPay(c, amt);
                          }}
                          className="text-xs px-2 py-1 rounded border border-[var(--ok)] text-[var(--ok)] hover:bg-[var(--ok)]/10"
                        >
                          UPI QR
                        </button>
                      )}
                      {summary.status === "paid" && latestPaidBillByCard.get(c.id) && (
                        <button
                          type="button"
                          onClick={() =>
                            requestConfirm("unmark", latestPaidBillByCard.get(c.id)!)
                          }
                          className="text-xs px-2 py-1 rounded border border-[var(--warn)] text-[var(--warn)] hover:bg-[var(--warn)]/10"
                        >
                          Unmark paid
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteCard(c.id)}
                        disabled={deletingCardId === c.id}
                        className="text-[var(--danger)] text-xs disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {deletingCardId === c.id && <Spinner size="xs" />}
                        {deletingCardId === c.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Open bills</h2>
        {openBills.length === 0 ? (
          <p className="text-[var(--muted)]">No open bills for this filter.</p>
        ) : (
          <div className="space-y-2">
            {openBills.map((b) => {
              const isOverdue = new Date(b.due_date) < new Date();
              const profileName = b.cards?.card_profiles?.name;
              const remaining = billRemaining(b);
              const paidSoFar = Number(b.amount_paid ?? 0);
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]"
                >
                  <div>
                    <span className="font-medium">
                      {b.cards?.nickname ?? "Card"} · ****{b.cards?.last4}
                    </span>
                    {profileName && (
                      <span className="text-[var(--muted)] ml-2 text-sm">
                        ({profileName})
                      </span>
                    )}
                    <span className="text-[var(--muted)] ml-2 text-sm uppercase">
                      {b.cards?.bank}
                    </span>
                    {b.status === "PARTIAL" && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[var(--warn)]/15 text-[var(--warn)]">
                        Partial
                      </span>
                    )}
                    <p className="text-sm mt-1">
                      {formatInr(remaining)} remaining
                      {b.status === "PARTIAL" && paidSoFar > 0 && (
                        <span className="text-[var(--muted)]">
                          {" "}
                          · paid {formatInr(paidSoFar)} of {formatInr(Number(b.amount))}
                        </span>
                      )}
                      {" · "}
                      due{" "}
                      <span className={isOverdue ? "text-[var(--danger)]" : ""}>
                        {b.due_date}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const card = cardById.get(b.card_id);
                      return (
                        card &&
                        supportsCreditCardUpi(card.bank) && (
                          <button
                            type="button"
                            onClick={() => openUpiPay(card, remaining)}
                            className="text-sm px-3 py-1 rounded border border-[var(--ok)] text-[var(--ok)] hover:bg-[var(--ok)]/10"
                          >
                            UPI QR
                          </button>
                        )
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => openPayDialog(b)}
                      className="text-sm px-3 py-1 rounded border border-[var(--border)]"
                    >
                      Record payment
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {recentPaidBills.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Marked paid</h2>
          <div className="space-y-2">
            {recentPaidBills.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--row-paid)]"
              >
                <div>
                  <span className="font-medium">
                    {b.cards?.nickname ?? "Card"} · ****{b.cards?.last4}
                  </span>
                  <p className="text-sm mt-1 text-[var(--muted)]">
                    {formatInr(Number(b.amount))} · due {b.due_date}
                    {b.paid_at && (
                      <span> · paid {b.paid_at.slice(0, 10)}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => requestConfirm("unmark", b)}
                  className="text-sm px-3 py-1 rounded border border-[var(--warn)] text-[var(--warn)] hover:bg-[var(--warn)]/10"
                >
                  Unmark paid
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {upiDialog && (
        <UpiPayDialog
          open
          onClose={() => setUpiDialog(null)}
          nickname={upiDialog.nickname}
          bankLabel={upiDialog.bankLabel}
          issuer={upiDialog.issuer}
          vpa={upiDialog.vpa}
          upiUrl={upiDialog.upiUrl}
          format={upiDialog.format}
          amount={upiDialog.amount}
        />
      )}

      {payDialogBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-labelledby="pay-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
            <h3 id="pay-dialog-title" className="font-semibold text-lg">
              Record payment
            </h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              {payDialogBill.cards?.nickname ?? "Card"} · total{" "}
              {formatInr(Number(payDialogBill.amount))}
              {Number(payDialogBill.amount_paid ?? 0) > 0 && (
                <> · already paid {formatInr(Number(payDialogBill.amount_paid))}</>
              )}
            </p>
            <label className="block mt-4 text-sm">
              Partial amount (₹)
              <input
                type="number"
                min={1}
                step="0.01"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]"
              />
            </label>
            <div className="flex flex-wrap gap-2 mt-5 justify-end">
              <button
                type="button"
                onClick={() => {
                  setPayDialogBill(null);
                  setPartialAmount("");
                }}
                className="px-3 py-2 rounded-lg border border-[var(--border)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!partialAmount || Number(partialAmount) <= 0}
                onClick={() => {
                  const paid = Number(partialAmount);
                  const newPaid =
                    Number(payDialogBill.amount_paid ?? 0) + paid;
                  if (newPaid >= Number(payDialogBill.amount) - 0.01) {
                    requestConfirm("paid_full", payDialogBill);
                  } else {
                    requestConfirm("paid_partial", payDialogBill, paid);
                  }
                }}
                className="px-3 py-2 rounded-lg border border-[var(--border)] disabled:opacity-50"
              >
                Save partial
              </button>
              <button
                type="button"
                onClick={() => requestConfirm("paid_full", payDialogBill)}
                className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700"
              >
                Paid in full
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-labelledby="confirm-dialog-title"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !confirming) setConfirmAction(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="font-semibold text-lg">
              {confirmTitle()}
            </h3>
            <div className="mt-3">{confirmBody()}</div>
            <div className="flex flex-wrap gap-2 mt-5 justify-end">
              <button
                type="button"
                disabled={confirming}
                onClick={() => setConfirmAction(null)}
                className="px-3 py-2 rounded-lg border border-[var(--border)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void executeConfirm();
                }}
                className={`px-3 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-2 ${
                  confirmAction.kind === "unmark"
                    ? "border border-[var(--warn)] text-[var(--warn)] hover:bg-[var(--warn)]/10"
                    : "bg-brand-600 hover:bg-brand-700 text-white"
                }`}
              >
                {confirming && <Spinner />}
                {confirming
                  ? "Saving…"
                  : confirmAction.kind === "unmark"
                    ? "Unmark paid"
                    : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "danger" | "warn" | "ok";
}) {
  const color =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warn"
        ? "var(--warn)"
        : "var(--ok)";
  return (
    <div className="min-w-0 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <p className="text-[var(--muted)] text-sm truncate">{label}</p>
      <p
        className="text-xl sm:text-2xl font-bold tabular-nums truncate"
        style={{ color }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
