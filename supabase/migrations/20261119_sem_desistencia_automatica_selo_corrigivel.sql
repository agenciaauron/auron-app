-- Rafael (19/11): nada vai para Desqualificado sozinho. Desliga o agendamento das 9h.
select cron.unschedule('desistir-sem-resposta')
where exists (select 1 from cron.job where jobname = 'desistir-sem-resposta');
drop function if exists private.desistir_sem_resposta();

-- Selo de conversa corrigido pelo SDR. Vale até a conversa andar
-- (nova mensagem do lead ou nova tentativa depois da correção).
alter table public.leads
  add column if not exists conversation_override text,
  add column if not exists conversation_override_at timestamptz;

alter table public.leads drop constraint if exists leads_conversation_override_check;
alter table public.leads add constraint leads_conversation_override_check check (
  conversation_override is null or conversation_override in
    ('sua_vez', 'aguardando', 'nunca_respondeu', 'parou_de_responder', 'faltou_reuniao')
);
