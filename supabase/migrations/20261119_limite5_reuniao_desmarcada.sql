-- 19/11/2026 (pedido do Rafael)
-- * Limite de tentativas sem resposta passa de 4 para 5.
-- * A contagem começa do zero em 2026-11-19 18:30 UTC (15h30 de Brasília):
--   tentativas antes disso não contam para a desistência automática.
-- * Reunião ganha "desmarcada" (com motivo na atividade "reuniao_desmarcada").

alter table public.leads drop constraint if exists leads_meeting_status_check;
alter table public.leads add constraint leads_meeting_status_check check (
  meeting_status is null or meeting_status = any (array['agendada', 'realizada', 'nao_compareceu', 'desmarcada'])
);

alter table public.lead_activities drop constraint if exists lead_activities_type_check;
alter table public.lead_activities add constraint lead_activities_type_check check (
  type = any (array[
    'ligacao', 'mensagem', 'nao_atendeu', 'reuniao_marcada', 'reuniao_realizada',
    'nao_compareceu', 'nota', 'reuniao_confirmada', 'reuniao_remarcada', 'reuniao_desmarcada'
  ])
);

create or replace function private.desistir_sem_resposta()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer := 0;
  item record;
  counted_from constant timestamptz := '2026-11-19 18:30:00+00';
begin
  for item in
    select l.id, l.company_id, lost.id as lost_stage_id
    from public.leads l
    join public.pipeline_stages s on s.id = l.stage_id
    join public.pipeline_stages lost on lost.company_id = l.company_id and lost.is_lost and not lost.archived
    where s.slug in ('em-contato', 'qualificado')
      and coalesce(l.meeting_status, '') <> 'agendada'
      and (
        select count(*) from public.lead_activities a
        where a.lead_id = l.id
          and a.type in ('mensagem', 'ligacao', 'nao_atendeu')
          and a.created_at > greatest(coalesce(l.last_message_at, l.created_at), counted_from)
      ) >= 5
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
            'Desqualificado automaticamente: 5 tentativas sem resposta. Se ele responder, volta para Em conversa.');

    moved := moved + 1;
  end loop;

  return moved;
end;
$$;

revoke all on function private.desistir_sem_resposta() from public, anon, authenticated;
