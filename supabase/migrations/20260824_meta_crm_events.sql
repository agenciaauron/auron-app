alter table public.leads
  add column if not exists meta_qualified_sent_at timestamptz,
  add column if not exists meta_qualified_event_id text,
  add column if not exists meta_purchase_sent_at timestamptz,
  add column if not exists meta_purchase_event_id text,
  add column if not exists meta_last_error text,
  add column if not exists meta_last_error_at timestamptz;

create index if not exists leads_company_meta_qualified_idx
  on public.leads (company_id, meta_qualified_sent_at)
  where meta_qualified_sent_at is not null;

create index if not exists leads_company_meta_purchase_idx
  on public.leads (company_id, meta_purchase_sent_at)
  where meta_purchase_sent_at is not null;
