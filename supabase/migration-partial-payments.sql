-- Partial payments: run in Supabase SQL Editor after schema.sql

alter table bills
  add column if not exists amount_paid numeric not null default 0;

alter table bills drop constraint if exists bills_status_check;

alter table bills
  add constraint bills_status_check
  check (status in ('UNPAID', 'PARTIAL', 'PAID'));
