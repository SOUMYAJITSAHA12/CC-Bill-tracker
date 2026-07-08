-- Current Outstanding tracking: run in Supabase SQL Editor after schema.sql
--
-- Adds live account-balance ("Current Outstanding Amount" from BillDesk's
-- additional_details) to the `cards` table so the dashboard can display a
-- per-card outstanding column and a cumulative outstanding tile at the top.
--
-- Both columns are nullable — a card that has never been fetched (or whose
-- portal didn't return the field) simply has no value.

alter table cards
  add column if not exists current_outstanding numeric,
  add column if not exists outstanding_fetched_at timestamptz;
