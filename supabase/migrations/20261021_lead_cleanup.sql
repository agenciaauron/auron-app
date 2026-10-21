-- Limpeza do funil: permite desqualificar leads com motivo, mantendo o
-- histórico para análise de quais anúncios trazem leads desqualificados.

alter table public.leads
  add column if not exists lost_reason text,
  add column if not exists lost_at timestamptz;

create index if not exists leads_company_stage_idx
  on public.leads (company_id, stage_id);
