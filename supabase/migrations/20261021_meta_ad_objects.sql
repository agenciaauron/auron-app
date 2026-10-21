-- Campanhas, conjuntos e anúncios da conta conectada, com o status atual na Meta.
-- A tela de Campanhas usa effective_status para mostrar só o que está ativo
-- e campaign_id/adset_id para filtrar conjuntos e anúncios pela seleção.
create table if not exists public.meta_ad_objects (
  company_id uuid not null references public.companies(id) on delete cascade,
  object_id text not null,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  name text,
  effective_status text,
  campaign_id text,
  adset_id text,
  synced_at timestamptz not null default now(),
  primary key (company_id, object_id)
);

alter table public.meta_ad_objects enable row level security;

drop policy if exists meta_ad_objects_member on public.meta_ad_objects;
create policy meta_ad_objects_member
  on public.meta_ad_objects for all
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = meta_ad_objects.company_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = meta_ad_objects.company_id
        and cm.user_id = auth.uid()
    )
  );
