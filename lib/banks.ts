/**
 * BillDesk Kotak portal biller display names (from live portal, 2026).
 *
 * Per-biller rate-limit hints:
 * - laneDelayMs: extra wait between cards of the same biller in a lane.
 *   ICICI is aggressive about "Too many request for that Biller" and needs
 *   a longer gap than the default BILLER_FETCH_DELAY_MS.
 * - freshSessionPerCard: when true, the lane re-inits the BillDesk session
 *   before every card so each request uses a brand-new session key. Helps
 *   ICICI because their rate limit is tracked per session/biller pair.
 */
export const BANK_BILLER_MAP: Record<
  string,
  {
    name: string;
    billerId?: string;
    laneDelayMs?: number;
    freshSessionPerCard?: boolean;
  }
> = {
  au: { name: "AU Bank Credit Card" },
  axis: { name: "Axis Bank Credit Card", billerId: "AXIS00000NATKF" },
  bandhan: { name: "Bandhan Bank Credit Card" },
  boi: { name: "Bank of India" },
  bob: { name: "BoB Credit Card", billerId: "BANK00000NATKB" },
  canara: { name: "Canara Credit Card" },
  cub: { name: "CUB Credit Card" },
  dbs: { name: "DBS Bank Credit Card" },
  dcb: { name: "DCB Bank Credit Card" },
  dhanlaxmi: { name: "Dhanlaxmi Bank Limited" },
  esaf: { name: "ESAF Bank Credit Card" },
  federal: { name: "Fed Credit card", billerId: "FEDE00000NATDL" },
  hdfc: { name: "HDFC BANK CREDIT CARD" },
  hdfc_pixel: { name: "HDFC Bank Pixel Credit Card" },
  hsbc: { name: "HSBC Credit Card" },
  icici: {
    name: "ICICI Credit card",
    billerId: "ICIC00000NATSI",
    laneDelayMs: 15000,
    freshSessionPerCard: true,
  },
  idbi: { name: "IDBI Bank Credit Card" },
  idfc: { name: "IDFC FIRST Bank Credit Card", billerId: "IDFC00000NATFQ" },
  indusind: { name: "IndusInd Credit Card" },
  iob: { name: "IOB Credit Card" },
  kotak: {
    name: "Kotak Mahindra Bank Credit Card",
    billerId: "KOTA00000NATED",
  },
  pnb: { name: "Punjab National Bank Credit Card" },
  rbl: { name: "RBL Bank Credit Card" },
  sbi: { name: "SBI Card", billerId: "SBIC00000NATDN" },
  union: { name: "Union Bank of India Credit Card" },
  yes: { name: "Yes Bank Credit Card" },
};

export const BANK_OPTIONS = Object.keys(BANK_BILLER_MAP).sort();

export function billerNameForBank(bank: string): string | null {
  return BANK_BILLER_MAP[bank.toLowerCase()]?.name ?? null;
}

export function billerIdForBank(bank: string): string | null {
  return BANK_BILLER_MAP[bank.toLowerCase()]?.billerId ?? null;
}

export function laneDelayForBank(bank: string): number | null {
  return BANK_BILLER_MAP[bank.toLowerCase()]?.laneDelayMs ?? null;
}

export function freshSessionPerCardForBank(bank: string): boolean {
  return BANK_BILLER_MAP[bank.toLowerCase()]?.freshSessionPerCard === true;
}

/** Min 3 chars for NLIBILLERLSSEARCH */
export function searchTermForBank(bank: string): string {
  const entry = BANK_BILLER_MAP[bank.toLowerCase()];
  if (!entry) return bank.slice(0, 6);
  const first = entry.name.split(/\s+/)[0]?.toLowerCase() ?? bank;
  if (first.length >= 3) return first;
  return entry.name.replace(/credit card/i, "").trim().slice(0, 8).toLowerCase() || bank;
}
