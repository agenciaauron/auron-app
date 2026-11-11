-- Fase 1 do SDR: perfil "sdr", trava do financeiro e dos anúncios, funil de prospecção,
-- próximo contato, reunião, registro de atividades e comissão.

-- 1. Perfil SDR -------------------------------------------------------------------------
alter table public.company_members drop constraint if exists company_members_role_check;
alter table public.company_members
  add constraint company_members_role_check
  check (role in ('owner', 'admin', 'member', 'sdr'));

-- Dono e administrador da empresa (quem pode ver financeiro, anúncios e excluir leads).
create or replace function private.is_company_manager(target_company_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.company_members
    where user_id = (select auth.uid())
      and company_id = target_company_id
      and role in ('owner', 'admin')
  );
$$;

-- Nomes da equipe: cada um vê o perfil de quem está na mesma empresa.
drop policy if exists "Members can view team profiles" on public.profiles;
create policy "Members can view team profiles"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.company_members mine
      join public.company_members other on other.company_id = mine.company_id
      where mine.user_id = (select auth.uid())
        and other.user_id = profiles.id
    )
  );

-- 2. Financeiro só para dono/administrador ---------------------------------------------
do $$
declare
  t text;
  op text;
begin
  foreach t in array array['finance_clients', 'finance_payments'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || op || '_member', t);
      execute format('drop policy if exists %I on public.%I', t || '_' || op || '_manager', t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using ((select private.is_company_manager(company_id)))',
      t || '_select_manager', t);
    execute format(
      'create policy %I on public.%I for insert with check ((select private.is_company_manager(company_id)))',
      t || '_insert_manager', t);
    execute format(
      'create policy %I on public.%I for update using ((select private.is_company_manager(company_id))) with check ((select private.is_company_manager(company_id)))',
      t || '_update_manager', t);
    execute format(
      'create policy %I on public.%I for delete using ((select private.is_company_manager(company_id)))',
      t || '_delete_manager', t);
  end loop;
end $$;

-- 3. Gasto de anúncios só para dono/administrador --------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['meta_ad_accounts', 'meta_ad_insights', 'meta_ad_objects'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager', t);
    execute format(
      'create policy %I on public.%I for all using ((select private.is_company_manager(company_id))) with check ((select private.is_company_manager(company_id)))',
      t || '_manager', t);
  end loop;
end $$;

-- 4. Só dono/administrador exclui lead --------------------------------------------------
drop policy if exists "Members can delete leads" on public.leads;
drop policy if exists "Managers can delete leads" on public.leads;
create policy "Managers can delete leads"
  on public.leads for delete
  using (
    (select private.is_super_admin())
    or (select private.is_company_manager(leads.company_id))
  );

-- 5. Campos novos do lead ---------------------------------------------------------------
alter table public.leads
  add column if not exists origin text not null default 'trafego',
  add column if not exists sdr_id uuid references auth.users(id) on delete set null,
  add column if not exists next_action_at timestamptz,
  add column if not exists next_action_note text,
  add column if not exists meeting_at timestamptz,
  add column if not exists meeting_status text,
  add column if not exists won_at timestamptz;

alter table public.leads drop constraint if exists leads_origin_check;
alter table public.leads
  add constraint leads_origin_check check (origin in ('trafego', 'prospeccao'));

alter table public.leads drop constraint if exists leads_meeting_status_check;
alter table public.leads
  add constraint leads_meeting_status_check
  check (meeting_status is null or meeting_status in ('agendada', 'realizada', 'nao_compareceu'));

create index if not exists leads_company_next_action_idx on public.leads (company_id, next_action_at);
create index if not exists leads_company_meeting_idx on public.leads (company_id, meeting_at);
create index if not exists leads_company_won_at_idx on public.leads (company_id, won_at);

-- Data da venda das vendas que já existem: última vez que entraram na etapa de venda.
update public.leads l
set won_at = coalesce(
  (
    select max(h.created_at)
    from public.lead_history h
    join public.pipeline_stages s on s.id = h.to_stage_id
    where h.lead_id = l.id and s.is_won
  ),
  l.updated_at
)
from public.pipeline_stages s
where s.id = l.stage_id and s.is_won and l.won_at is null;

-- 6. Funil de prospecção ----------------------------------------------------------------
-- Cada etapa pertence ao funil do tráfego, ao da prospecção ou aos dois.
alter table public.pipeline_stages
  add column if not exists pipeline text not null default 'ambos';

alter table public.pipeline_stages drop constraint if exists pipeline_stages_pipeline_check;
alter table public.pipeline_stages
  add constraint pipeline_stages_pipeline_check check (pipeline in ('trafego', 'prospeccao', 'ambos'));

do $$
declare
  c record;
begin
  for c in
    select distinct company_id from public.pipeline_stages where slug = 'novo-lead'
  loop
    if exists (select 1 from public.pipeline_stages where company_id = c.company_id and slug = 'a-contatar') then
      continue;
    end if;

    -- Abre espaço nas posições (a posição é única por empresa).
    update public.pipeline_stages set position = position + 100 where company_id = c.company_id;

    insert into public.pipeline_stages (company_id, name, slug, position, is_won, is_lost, pipeline)
    values
      (c.company_id, 'A contatar', 'a-contatar', 201, false, false, 'prospeccao'),
      (c.company_id, 'Contato feito', 'contato-feito', 202, false, false, 'prospeccao'),
      (c.company_id, 'Respondeu', 'respondeu', 203, false, false, 'prospeccao');

    -- "Novo lead" continua em 1º: o webhook do WhatsApp coloca os leads novos na 1ª etapa.
    update public.pipeline_stages
    set position = case slug
        when 'novo-lead' then 1
        when 'a-contatar' then 2
        when 'contato-feito' then 3
        when 'respondeu' then 4
        when 'qualificado' then 5
        when 'reuniao' then 6
        when 'venda' then 7
        when 'desqualificado' then 8
        else position
      end,
      pipeline = case slug
        when 'novo-lead' then 'trafego'
        when 'qualificado' then 'trafego'
        when 'a-contatar' then 'prospeccao'
        when 'contato-feito' then 'prospeccao'
        when 'respondeu' then 'prospeccao'
        else 'ambos'
      end
    where company_id = c.company_id;
  end loop;
end $$;

-- 7. Registro de atividades -------------------------------------------------------------
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  type text not null check (type in ('ligacao', 'mensagem', 'nao_atendeu', 'reuniao_marcada', 'reuniao_realizada', 'nao_compareceu', 'nota')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
create index if not exists lead_activities_company_idx on public.lead_activities (company_id, created_at desc);

alter table public.lead_activities enable row level security;

drop policy if exists lead_activities_select_member on public.lead_activities;
create policy lead_activities_select_member
  on public.lead_activities for select
  using ((select private.is_super_admin()) or (select private.is_company_member(company_id)));

drop policy if exists lead_activities_insert_member on public.lead_activities;
create policy lead_activities_insert_member
  on public.lead_activities for insert
  with check (
    user_id = (select auth.uid())
    and (select private.is_company_member(company_id))
  );

drop policy if exists lead_activities_delete_manager on public.lead_activities;
create policy lead_activities_delete_manager
  on public.lead_activities for delete
  using ((select private.is_company_manager(company_id)));
