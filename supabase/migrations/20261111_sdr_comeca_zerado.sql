-- O SDR começa "zerado": vê só os leads que chegaram depois do início dele
-- (leads_visible_from, ou a data em que entrou na empresa) e os leads em que ele é o SDR.
-- Dono, administrador e equipe continuam vendo todos os leads.

alter table public.company_members
  add column if not exists leads_visible_from timestamptz;

create or replace function private.can_view_lead(
  target_company_id uuid,
  lead_created_at timestamptz,
  lead_sdr_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.company_members m
    where m.user_id = (select auth.uid())
      and m.company_id = target_company_id
      and (
        m.role <> 'sdr'
        or lead_sdr_id = m.user_id
        or lead_created_at >= coalesce(m.leads_visible_from, m.created_at)
      )
  );
$$;

drop policy if exists "Members can view leads" on public.leads;
create policy "Members can view leads"
  on public.leads for select
  using (
    (select private.is_super_admin())
    or private.can_view_lead(company_id, created_at, sdr_id)
  );
