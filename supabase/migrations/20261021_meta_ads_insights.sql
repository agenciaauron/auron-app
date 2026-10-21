-- Análise de campanhas: conta de anúncios da Meta por empresa e gasto diário por anúncio.
-- Os leads de WhatsApp guardam o ID do anúncio em leads.meta_source_id, que casa com meta_ad_insights.ad_id.
create table if not exists public.meta_ad_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]+$'),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_ad_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad_account_id text not null,
  date date not null,
  ad_id text not null,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  spend numeric(12,2) not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  synced_at timestamptz not null default now(),
  unique (company_id, ad_id, date)
);

create index if not exists meta_ad_insights_company_date_idx
  on public.meta_ad_insights (company_id, date);

create index if not exists leads_company_meta_source_idx
  on public.leads (company_id, meta_source_id)
  where meta_source_id is not null;

alter table public.meta_ad_accounts enable row level security;
alter table public.meta_ad_insights enable row level security;

drop policy if exists meta_ad_accounts_member on public.meta_ad_accounts;
create policy meta_ad_accounts_member
  on public.meta_ad_accounts for all
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = meta_ad_accounts.company_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = meta_ad_accounts.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists meta_ad_insights_member on public.meta_ad_insights;
create policy meta_ad_insights_member
  on public.meta_ad_insights for all
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = meta_ad_insights.company_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = meta_ad_insights.company_id
        and cm.user_id = auth.uid()
    )
  );
