create table if not exists public.finance_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  due_day smallint not null check (due_day between 1 and 31),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  finance_client_id uuid not null references public.finance_clients(id) on delete cascade,
  competence date not null,
  due_date date not null,
  paid_at date not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  unique (finance_client_id, competence)
);

create index if not exists finance_clients_company_status_idx
  on public.finance_clients (company_id, status);

create index if not exists finance_payments_company_competence_idx
  on public.finance_payments (company_id, competence);

create index if not exists finance_payments_client_paid_at_idx
  on public.finance_payments (finance_client_id, paid_at desc);

alter table public.finance_clients enable row level security;
alter table public.finance_payments enable row level security;

drop policy if exists finance_clients_select_member on public.finance_clients;
create policy finance_clients_select_member
  on public.finance_clients for select
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_clients.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_clients_insert_member on public.finance_clients;
create policy finance_clients_insert_member
  on public.finance_clients for insert
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_clients.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_clients_update_member on public.finance_clients;
create policy finance_clients_update_member
  on public.finance_clients for update
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_clients.company_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_clients.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_clients_delete_member on public.finance_clients;
create policy finance_clients_delete_member
  on public.finance_clients for delete
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_clients.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_payments_select_member on public.finance_payments;
create policy finance_payments_select_member
  on public.finance_payments for select
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_payments.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_payments_insert_member on public.finance_payments;
create policy finance_payments_insert_member
  on public.finance_payments for insert
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_payments.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_payments_update_member on public.finance_payments;
create policy finance_payments_update_member
  on public.finance_payments for update
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_payments.company_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_payments.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists finance_payments_delete_member on public.finance_payments;
create policy finance_payments_delete_member
  on public.finance_payments for delete
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = finance_payments.company_id
        and cm.user_id = auth.uid()
    )
  );
