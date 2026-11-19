-- Funil comercial mais simples (19/11/2026)
-- * "Em contato" + "Sem resposta" viram uma etapa só: "Em conversa".
--   O CRM calcula sozinho de quem é a vez (selo no card), sem arrastar card.
-- * "Sem resposta" fica arquivada (some das telas, mas o histórico antigo continua com nome).
-- * Qualificado vai para o fim, ao lado de Desqualificado (as duas recolhíveis).
-- * Reunião ganha "confirmada" e "remarcada" no registro de atividades.
-- * Todo dia às 9h (Brasília): lead em conversa com 4 tentativas sem resposta e
--   2 dias sem retorno vai para Desqualificado ("Não respondeu"). Se responder depois,
--   o webhook devolve para "Em conversa".

alter table public.pipeline_stages
  add column if not exists archived boolean not null default false;

-- Leads de "Sem resposta" vão para "Em conversa"; as cores manuais deixam de existir.
update public.leads l
set stage_id = ec.id, no_reply_tag = null, updated_at = now()
from public.pipeline_stages sr
join public.pipeline_stages ec on ec.company_id = sr.company_id and ec.slug = 'em-contato'
where sr.slug = 'sem-resposta' and l.stage_id = sr.id;

update public.leads set no_reply_tag = null where no_reply_tag is not null;

update public.pipeline_stages set archived = true where slug = 'sem-resposta';
update public.pipeline_stages set name = 'Em conversa' where slug = 'em-contato';

-- Nova ordem: ... Reunião 7, Venda 8, Qualificado 9, Desqualificado 10.
update public.pipeline_stages set position = position + 100 where slug in ('qualificado', 'reuniao', 'venda');
update public.pipeline_stages set position = 7 where slug = 'reuniao';
update public.pipeline_stages set position = 8 where slug = 'venda';
update public.pipeline_stages set position = 9 where slug = 'qualificado';

alter table public.lead_activities drop constraint if exists lead_activities_type_check;
alter table public.lead_activities add constraint lead_activities_type_check check (
  type = any (array[
    'ligacao', 'mensagem', 'nao_atendeu', 'reuniao_marcada', 'reuniao_realizada',
    'nao_compareceu', 'nota', 'reuniao_confirmada', 'reuniao_remarcada'
  ])
);

-- Desistência automática de quem não responde.
create or replace function private.desistir_sem_resposta()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer := 0;
  item record;
begin
  for item in
    select l.id, l.company_id, lost.id as lost_stage_id
    from public.leads l
    join public.pipeline_stages s on s.id = l.stage_id
    join public.pipeline_stages lost on lost.company_id = l.company_id and lost.is_lost and not lost.archived
    where s.slug in ('em-contato', 'qualificado')
      and (
        select count(*) from public.lead_activities a
        where a.lead_id = l.id
          and a.type in ('mensagem', 'ligacao', 'nao_atendeu')
          and a.created_at > coalesce(l.last_message_at, l.created_at)
      ) >= 4
      and (
        select max(a.created_at) from public.lead_activities a
        where a.lead_id = l.id and a.type in ('mensagem', 'ligacao', 'nao_atendeu')
      ) < now() - interval '2 days'
  loop
    update public.leads
    set stage_id = item.lost_stage_id,
        lost_reason = 'Não respondeu',
        lost_at = now(),
        next_action_at = null,
        next_action_note = null,
        updated_at = now()
    where id = item.id;

    insert into public.lead_activities (company_id, lead_id, user_id, type, note)
    values (item.company_id, item.id, null, 'nota',
            'Desqualificado automaticamente: 4 tentativas sem resposta. Se ele responder, volta para Em conversa.');

    moved := moved + 1;
  end loop;

  return moved;
end;
$$;

revoke all on function private.desistir_sem_resposta() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.unschedule('desistir-sem-resposta')
where exists (select 1 from cron.job where jobname = 'desistir-sem-resposta');

-- 12:00 UTC = 9:00 em Brasília.
select cron.schedule('desistir-sem-resposta', '0 12 * * *', $$select private.desistir_sem_resposta()$$);
