-- Início da cobrança: vencimentos anteriores a essa data não são cobrados.
-- Clientes existentes começam na data em que foram cadastrados.
alter table public.finance_clients
  add column if not exists billing_start date;

update public.finance_clients
  set billing_start = created_at::date
  where billing_start is null;

alter table public.finance_clients
  alter column billing_start set default current_date;
