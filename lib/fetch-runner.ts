import { createAdminClient } from "@/lib/supabase/admin";
import { BillDeskClient } from "@/lib/billdesk/client";
import {
  billerIdForBank,
  billerNameForBank,
  freshSessionPerCardForBank,
  laneDelayForBank,
} from "@/lib/banks";
import { normalizeFetchResult } from "@/lib/billdesk/no-dues";
import type { BillFetchResult, Card, FetchPersistOutcome } from "@/lib/types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AMOUNT_TOLERANCE = 1;

export type CardFetchOutcome = {
  card_id: string;
  nickname: string;
  status: string;
  error?: string;
  amount?: number;
  due_date?: string;
  bill_date?: string;
  portal_amount?: number;
};

export type FetchRunSummary = {
  run_id: string;
  fetched: number;
  no_dues: number;
  failed: number;
  skipped: number;
  skipped_paid: number;
  details: CardFetchOutcome[];
};

export type FetchProgressEvent =
  | {
      type: "start";
      run_id: string;
      total: number;
      lanes: { biller: string; cards: { card_id: string; nickname: string }[] }[];
    }
  | {
      type: "card_start";
      card_id: string;
      nickname: string;
      bank: string;
      biller: string;
      done: number;
      total: number;
    }
  | {
      type: "card_done";
      outcome: CardFetchOutcome;
      done: number;
      total: number;
    }
  | { type: "complete"; summary: FetchRunSummary }
  | { type: "error"; message: string };

function outcomeStatusFromPersist(
  portalStatus: BillFetchResult["status"],
  persist: FetchPersistOutcome
): string {
  if (persist === "skipped_paid_cycle") return "SKIPPED_PAID_CYCLE";
  if (persist === "skipped_partial_portal_full") return "SKIPPED_PARTIAL_PORTAL";
  return portalStatus;
}

async function persistBillFromFetch(
  supabase: ReturnType<typeof createAdminClient>,
  card: Pick<Card, "id">,
  result: BillFetchResult
): Promise<FetchPersistOutcome> {
  if (result.status === "FETCHED" && result.amount && result.amount > 0) {
    const due = result.due_date ?? new Date().toISOString().slice(0, 10);
    const portalAmount = Number(result.amount);

    const { data: paidRows } = await supabase
      .from("bills")
      .select("id")
      .eq("card_id", card.id)
      .eq("due_date", due)
      .eq("status", "PAID")
      .limit(1);

    if (paidRows && paidRows.length > 0) {
      await supabase
        .from("bills")
        .delete()
        .eq("card_id", card.id)
        .eq("due_date", due)
        .eq("status", "UNPAID");
      return "skipped_paid_cycle";
    }

    const { data: partialRows } = await supabase
      .from("bills")
      .select("id, amount, amount_paid")
      .eq("card_id", card.id)
      .eq("due_date", due)
      .eq("status", "PARTIAL")
      .limit(1);

    const partialBill = partialRows?.[0];
    if (partialBill?.id) {
      const recordedAmount = Number(partialBill.amount);
      if (portalAmount >= recordedAmount - AMOUNT_TOLERANCE) {
        return "skipped_partial_portal_full";
      }
      await supabase
        .from("bills")
        .update({
          amount: portalAmount,
          bill_date: result.bill_date ?? due,
          min_due: result.min_due ?? 0,
          fetched_via: "BILLDESK_API",
        })
        .eq("id", partialBill.id);
      return "fetched";
    }

    const { data: existingBill } = await supabase
      .from("bills")
      .select("id")
      .eq("card_id", card.id)
      .eq("due_date", due)
      .eq("status", "UNPAID")
      .maybeSingle();

    const billRow = {
      card_id: card.id,
      due_date: due,
      bill_date: result.bill_date ?? due,
      amount: portalAmount,
      min_due: result.min_due ?? 0,
      amount_paid: 0,
      status: "UNPAID" as const,
      fetched_via: "BILLDESK_API",
    };

    if (existingBill?.id) {
      await supabase.from("bills").update(billRow).eq("id", existingBill.id);
    } else {
      await supabase.from("bills").insert(billRow);
    }
    return "fetched";
  }
  if (result.status === "NO_DUES") {
    const due = result.due_date;
    const { data: openBills } = await supabase
      .from("bills")
      .select("id, amount, amount_paid, due_date, status")
      .eq("card_id", card.id)
      .in("status", ["UNPAID", "PARTIAL"]);

    const targets = (openBills ?? []).filter(
      (b) => !due || b.due_date === due
    );
    const paidAt = new Date().toISOString();

    for (const bill of targets) {
      const { data: paidRows } = await supabase
        .from("bills")
        .select("id")
        .eq("card_id", card.id)
        .eq("due_date", bill.due_date)
        .eq("status", "PAID")
        .limit(1);

      if (paidRows?.length) {
        await supabase.from("bills").delete().eq("id", bill.id);
        continue;
      }

      await supabase
        .from("bills")
        .update({
          status: "PAID",
          amount_paid: Number(bill.amount),
          paid_at: paidAt,
        })
        .eq("id", bill.id);
    }
    return "no_dues";
  }
  return "failed";
}

/** Fetch bill for one saved card and write to Supabase */
export async function runSingleCardFetch(
  cardId: string,
  options?: { householdId?: string; client?: BillDeskClient; runId?: string }
): Promise<CardFetchOutcome> {
  const supabase = createAdminClient();
  const run_id = options?.runId ?? `single_${Date.now()}`;

  let query = supabase.from("cards").select("*").eq("id", cardId).eq("active", true);
  if (options?.householdId) {
    query = query.eq("household_id", options.householdId);
  }

  const { data: card, error: cardErr } = await query.maybeSingle();
  if (cardErr) throw cardErr;
  if (!card) {
    return {
      card_id: cardId,
      nickname: "",
      status: "FAILED",
      error: "Card not found",
    };
  }

  if (!billerNameForBank(card.bank)) {
    return {
      card_id: card.id,
      nickname: card.nickname,
      status: "FAILED",
      error: `Unsupported bank: ${card.bank}`,
    };
  }

  if (!card.mobile || !card.last4) {
    return {
      card_id: card.id,
      nickname: card.nickname,
      status: "FAILED",
      error: "Missing mobile or last4",
    };
  }

  const client = options?.client ?? new BillDeskClient();
  if (!options?.client) {
    await client.init();
  }

  let result: BillFetchResult;
  try {
    result = await client.fetchBill({
      bank: card.bank,
      mobile: String(card.mobile).trim(),
      last4: String(card.last4).trim(),
    });
  } catch (e) {
    result = {
      status: "FAILED",
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
  result = normalizeFetchResult(result);

  await supabase.from("fetch_log").insert({
    card_id: card.id,
    run_id,
    portal: "billdesk",
    status: result.status,
    amount: result.amount ?? 0,
    error: result.error ?? null,
  });

  const persist = await persistBillFromFetch(supabase, card, result);
  const displayStatus = outcomeStatusFromPersist(result.status, persist);

  return {
    card_id: card.id,
    nickname: card.nickname,
    status: displayStatus,
    error: result.error,
    amount: result.amount,
    due_date: result.due_date,
    bill_date: result.bill_date,
    portal_amount:
      persist === "skipped_paid_cycle" || persist === "skipped_partial_portal_full"
        ? result.amount
        : undefined,
  };
}

function billerKeyForCard(card: { bank: string }): string {
  return billerIdForBank(card.bank) ?? card.bank.toLowerCase();
}

function groupCardsByBiller<T extends { bank: string }>(cards: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const card of cards) {
    const key = billerKeyForCard(card);
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }
  return groups;
}

function recordOutcome(summary: FetchRunSummary, outcome: CardFetchOutcome) {
  summary.details.push(outcome);
  if (outcome.status === "FETCHED" && outcome.amount) summary.fetched++;
  else if (outcome.status === "NO_DUES") summary.no_dues++;
  else if (outcome.status === "SKIPPED_PAID_CYCLE") summary.skipped_paid++;
  else if (outcome.status === "FAILED") summary.failed++;
  else if (outcome.status === "SKIPPED_PARTIAL_PORTAL") summary.fetched++;
}

/**
 * Batch fetch: parallel across different BillDesk billers, sequential within
 * the same biller (avoids ICICI "too many request" while staying fast).
 *
 * Per-card progress events are emitted via `onProgress` so callers (e.g. the
 * streaming API route) can show a live progress bar.
 */
export async function runBatchFetch(options?: {
  householdId?: string;
  /** @deprecated Use FETCH_BILLER_PARALLEL — lanes run in parallel, not per-card */
  concurrency?: number;
  delayMs?: number;
  onProgress?: (event: FetchProgressEvent) => void;
}): Promise<FetchRunSummary> {
  const emit = (event: FetchProgressEvent) => {
    try {
      options?.onProgress?.(event);
    } catch {
      // never let a faulty consumer break the run
    }
  };

  const supabase = createAdminClient();
  const run_id = `run_${Date.now()}`;
  const billerParallel = Math.max(
    1,
    Number(
      process.env.FETCH_BILLER_PARALLEL ??
        options?.concurrency ??
        process.env.FETCH_CONCURRENCY ??
        6
    )
  );
  const defaultStaggerMs = Number(process.env.BILLER_FETCH_DELAY_MS ?? 4000);

  let query = supabase
    .from("cards")
    .select("*")
    .eq("active", true)
    .neq("mobile", "")
    .neq("last4", "");

  if (options?.householdId) {
    query = query.eq("household_id", options.householdId);
  }

  const { data: cards, error } = await query;
  if (error) throw error;

  const eligible = (cards ?? []).filter((c) => billerNameForBank(c.bank));
  const summary: FetchRunSummary = {
    run_id,
    fetched: 0,
    no_dues: 0,
    failed: 0,
    skipped: (cards?.length ?? 0) - eligible.length,
    skipped_paid: 0,
    details: [],
  };

  const lanes = [...groupCardsByBiller(eligible).entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  const total = eligible.length;
  let done = 0;

  emit({
    type: "start",
    run_id,
    total,
    lanes: lanes.map(([biller, cards]) => ({
      biller,
      cards: cards.map((c) => ({ card_id: c.id, nickname: c.nickname })),
    })),
  });

  async function runBillerLane(laneCards: (typeof eligible)[0][]) {
    if (laneCards.length === 0) return;

    const firstBank = laneCards[0].bank;
    const laneStaggerMs = laneDelayForBank(firstBank) ?? defaultStaggerMs;
    const freshSessionPerCard = freshSessionPerCardForBank(firstBank);

    const laneClient = new BillDeskClient();
    await laneClient.init();

    for (let i = 0; i < laneCards.length; i++) {
      const card = laneCards[i];

      // For rate-limited billers (ICICI), re-init the session before each card
      // so every request lands on a brand-new SESSIONKEY.
      if (freshSessionPerCard && i > 0) {
        try {
          await laneClient.resetSession();
        } catch {
          // fall through; existing session will be used
        }
      }

      emit({
        type: "card_start",
        card_id: card.id,
        nickname: card.nickname,
        bank: card.bank,
        biller: billerKeyForCard(card),
        done,
        total,
      });

      const outcome = await runSingleCardFetch(card.id, {
        householdId: options?.householdId,
        client: laneClient,
        runId: run_id,
      });
      recordOutcome(summary, outcome);
      done++;

      emit({ type: "card_done", outcome, done, total });

      if (i < laneCards.length - 1) {
        await delay(laneStaggerMs);
      }
    }
  }

  for (let w = 0; w < lanes.length; w += billerParallel) {
    const wave = lanes.slice(w, w + billerParallel);
    await Promise.all(wave.map(([, cards]) => runBillerLane(cards)));
  }

  emit({ type: "complete", summary });

  return summary;
}
