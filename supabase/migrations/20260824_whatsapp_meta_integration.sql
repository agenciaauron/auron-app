-- Integração Auron Conversões -> Auron CRM
-- Mantém no lead do CRM os identificadores necessários para atribuição e
-- para devolver eventos de funil à Meta posteriormente.

alter table public.leads
  add column if not exists integration_source text,
  add column if not exists integration_external_id text,
  add column if not exists wa_id text,
  add column if not exists waba_id text,
  add column if not exists ctwa_clid text,
  add column if not exists meta_source_id text,
  add column if not exists meta_source_url text,
  add column if not exists meta_headline text,
  add column if not exists last_message text,
  add column if not exists last_message_at timestamptz;

create unique index if not exists leads_company_integration_external_id_uq
  on public.leads (company_id, integration_source, integration_external_id)
  where integration_source is not null
    and integration_external_id is not null;

create index if not exists leads_company_ctwa_clid_idx
  on public.leads (company_id, ctwa_clid)
  where ctwa_clid is not null;

create index if not exists leads_company_waba_wa_idx
  on public.leads (company_id, waba_id, wa_id)
  where waba_id is not null
    and wa_id is not null;
