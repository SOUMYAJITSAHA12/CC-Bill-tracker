export type CardProfile = {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
};

export type Card = {
  id: string;
  household_id: string;
  profile_id: string | null;
  nickname: string;
  bank: string;
  last4: string;
  mobile: string;
  billing_date: number;
  due_date_day: number;
  credit_limit: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  card_profiles?: Pick<CardProfile, "id" | "name"> | null;
};

export type BillStatus = "UNPAID" | "PARTIAL" | "PAID";

export type Bill = {
  id: string;
  card_id: string;
  bill_date: string | null;
  due_date: string;
  amount: number;
  amount_paid?: number;
  min_due: number;
  status: BillStatus;
  fetched_via: string;
  created_at: string;
  paid_at: string | null;
  cards?: Pick<Card, "nickname" | "bank" | "last4" | "profile_id"> & {
    card_profiles?: Pick<CardProfile, "name"> | null;
  };
};

export type FetchLog = {
  id: string;
  card_id: string | null;
  run_id: string | null;
  portal: string;
  status: string;
  amount: number;
  error: string | null;
  fetched_at: string;
};

export type FetchPersistOutcome =
  | "fetched"
  | "no_dues"
  | "failed"
  | "skipped_paid_cycle"
  | "skipped_partial_portal_full";

export type BillFetchResult = {
  status: "FETCHED" | "NO_DUES" | "FAILED";
  amount?: number;
  due_date?: string;
  bill_date?: string;
  min_due?: number;
  error?: string;
};
