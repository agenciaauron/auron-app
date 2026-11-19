-- Cor que o SDR marca no lead da etapa "Sem resposta":
--   vermelho  = nunca_respondeu     (nunca respondeu no WhatsApp)
--   laranja   = parou_de_responder  (respondeu e parou do nada)
--   amarelo   = faltou_reuniao      (marcou reunião, não compareceu e precisa remarcar)
-- O CRM e o webhook limpam a cor quando o lead sai da etapa.
alter table public.leads
  add column if not exists no_reply_tag text;

alter table public.leads
  drop constraint if exists leads_no_reply_tag_check;

alter table public.leads
  add constraint leads_no_reply_tag_check
  check (no_reply_tag is null or no_reply_tag in ('nunca_respondeu', 'parou_de_responder', 'faltou_reuniao'));
