import type { BillFetchResult } from "@/lib/types";

/** BillDesk messages that mean success with nothing to pay */
export function isNoDuesMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /no\s*(?:bill|outstanding|dues?)/i.test(lower) ||
    /no\s*amount\s*due/i.test(lower) ||
    /no\s+bill\s+due/i.test(lower) ||
    /nothing\s*to\s*pay/i.test(lower) ||
    /payment\s+received/i.test(lower) ||
    /already\s+paid/i.test(lower) ||
    /billing\s+period.*no\s+bill/i.test(lower)
  );
}

/** User-facing text for NO_DUES outcomes */
export function noDuesDisplayMessage(error?: string): string {
  if (!error) return "No amount due";
  if (/no bill data available/i.test(error)) {
    return "No statement from SBI yet (nothing to pay this cycle)";
  }
  if (/payment received|no bill due/i.test(error)) {
    return error;
  }
  return error;
}

export function normalizeFetchResult(result: BillFetchResult): BillFetchResult {
  if (result.status === "FAILED" && result.error && isNoDuesMessage(result.error)) {
    return { status: "NO_DUES", error: result.error };
  }
  if (result.status === "FAILED" && !result.error) {
    return result;
  }
  return result;
}
