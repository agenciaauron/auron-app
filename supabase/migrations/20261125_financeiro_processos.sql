-- 25/11/2026 (pedido do Rafael): financeiro organizado por processo.
-- * Cada cliente tem o processo de onde veio: tráfego pago, indicação, prospecção ativa ou orgânico.
-- * Cliente que saiu fica guardado (alimenta os relatórios), mas some da lista do dia a dia.
-- * Gastos lançados à mão (recarga da Meta, imposto, retirada, avulsos) e gastos fixos que se repetem todo mês.
-- * A comissão do SDR NÃO é lançada: o painel calcula a partir das vendas do CRM (1ª mensalidade).

-- 1. Processo e saída do cliente ---------------------------------------------------------
alter table public.finance_clients
  add column if not exists channel text
    check (channel in ('trafego', 'indicacao', 'prospeccao', 'organico')),
  add column if not exists ended_at date;

comment on column public.finance_clients.channel is 'Processo de aquisição: trafego, indicacao, prospeccao, organico.';
comment on column public.finance_clients.ended_at is 'Quando o cliente saiu (status cancelled). Some da lista, continua nos relatórios.';

-- Ao cancelar, guarda a data de saída; ao reativar, limpa.
create or replace function private.finance_client_ended_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled' and new.ended_at is null then
    new.ended_at := current_date;
  elsif new.status <> 'cancelled' then
    new.ended_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_client_ended_at on public.finance_clients;
create trigger finance_client_ended_at
  before insert or update of status on public.finance_clients
  for each row execute function private.finance_client_ended_at();

-- 2. Gastos fixos (cadastrados uma vez, contam todo mês) -----------------------------------
create table if not exists public.finance_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  channel text check (channel in ('trafego', 'indicacao', 'prospeccao', 'organico')),
  starts_on date not null default date_trunc('month', current_date)::date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

-- 3. Gastos lançados -----------------------------------------------------------------------
-- category:
--   anuncios (recarga da Meta, processo tráfego), marketing (conteúdo, seguidores...),
--   ferramentas, contador, imposto, combustivel, transporte, outros  -> custos
--   retirada (distribuição de lucro), reserva (aplicação), devolucao  -> não são custo
create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  spent_at date not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (category in (
    'anuncios', 'marketing', 'ferramentas', 'contador', 'imposto', 'combustivel', 'transporte', 'outros',
    'retirada', 'reserva', 'devolucao'
  )),
  channel text check (channel in ('trafego', 'indicacao', 'prospeccao', 'organico')),
  description text,
  recurring_id uuid references public.finance_recurring_expenses(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'extrato')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.finance_recurring_expenses
  drop constraint if exists finance_recurring_expenses_category_check;
alter table public.finance_recurring_expenses
  add constraint finance_recurring_expenses_category_check check (category in (
    'anuncios', 'marketing', 'ferramentas', 'contador', 'imposto', 'combustivel', 'transporte', 'outros'
  ));

create index if not exists finance_expenses_company_spent_idx
  on public.finance_expenses (company_id, spent_at desc);
create index if not exists finance_expenses_recurring_idx
  on public.finance_expenses (recurring_id);
create index if not exists finance_recurring_company_idx
  on public.finance_recurring_expenses (company_id);

-- 4. Metas (uma linha por empresa) -------------------------------------------------------
create table if not exists public.finance_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  profit_goal numeric(12,2),
  updated_at timestamptz not null default now()
);

-- 5. Só dono/administrador -----------------------------------------------------------------
alter table public.finance_recurring_expenses enable row level security;
alter table public.finance_expenses enable row level security;
alter table public.finance_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['finance_recurring_expenses', 'finance_expenses', 'finance_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manager', t);
    execute format(
      'create policy %I on public.%I for all using ((select private.is_company_manager(company_id))) with check ((select private.is_company_manager(company_id)))',
      t || '_manager', t);
  end loop;
end $$;

-- 6. Salário / fixo da equipe (SDR Miguel: R$ 2.000 todo dia 5, referente ao período anterior).
alter table public.finance_expenses drop constraint if exists finance_expenses_category_check;
alter table public.finance_expenses add constraint finance_expenses_category_check check (category in (
  'anuncios', 'marketing', 'ferramentas', 'contador', 'imposto', 'combustivel', 'transporte', 'outros', 'salario',
  'retirada', 'reserva', 'devolucao'
));
alter table public.finance_recurring_expenses drop constraint if exists finance_recurring_expenses_category_check;
alter table public.finance_recurring_expenses add constraint finance_recurring_expenses_category_check check (category in (
  'anuncios', 'marketing', 'ferramentas', 'contador', 'imposto', 'combustivel', 'transporte', 'outros', 'salario'
));

-- 7. Uma parcela pode ser paga em partes (ex.: entrada + restante).
alter table public.finance_payments drop constraint if exists finance_payments_client_competence_installment_key;
create index if not exists finance_payments_client_competence_installment_idx
  on public.finance_payments (finance_client_id, competence, installment);
