-- Funil da Auron: Novo lead -> Qualificado -> Reunião -> Venda -> Desqualificado.
-- Remove "Em atendimento" (os leads voltam para Novo lead) e renomeia "Perdido".
-- Aplicada em produção em 2026-10-21.
do $$
declare
  c record;
  v_new uuid;
  v_attend uuid;
begin
  for c in select distinct company_id from public.pipeline_stages loop
    select id into v_new from public.pipeline_stages
      where company_id = c.company_id and slug <> 'em-atendimento' and not is_won and not is_lost
      order by position limit 1;
    select id into v_attend from public.pipeline_stages
      where company_id = c.company_id and name = 'Em atendimento' limit 1;

    if v_attend is not null and v_new is not null and v_attend <> v_new then
      update public.leads set stage_id = v_new, updated_at = now() where stage_id = v_attend;
      delete from public.pipeline_stages where id = v_attend;
    end if;

    update public.pipeline_stages set position = position + 100 where company_id = c.company_id;

    update public.pipeline_stages set name = 'Desqualificado', slug = 'desqualificado'
      where company_id = c.company_id and is_lost;

    with ordered as (
      select id, row_number() over (order by is_lost, position) as pos
      from public.pipeline_stages where company_id = c.company_id
    )
    update public.pipeline_stages s set position = o.pos from ordered o where s.id = o.id;
  end loop;
end $$;
