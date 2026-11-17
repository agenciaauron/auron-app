-- Funil do tráfego: Novo lead → Em contato → Sem resposta → Qualificado → Reunião → Venda (e Desqualificado).
-- "Em contato" = o lead respondeu e a conversa está andando.
-- "Sem resposta" = parou de responder e está em follow-up (o webhook devolve para "Em contato" quando ele responde).
-- As etapas novas ficam antes de "Qualificado": não contam como qualificado nos números nem nos eventos da Meta.

do $$
declare
  c record;
begin
  for c in
    select distinct company_id from public.pipeline_stages where slug = 'novo-lead'
  loop
    if exists (select 1 from public.pipeline_stages where company_id = c.company_id and slug = 'em-contato') then
      continue;
    end if;

    -- Abre espaço nas posições (a posição é única por empresa).
    update public.pipeline_stages set position = position + 100 where company_id = c.company_id;

    insert into public.pipeline_stages (company_id, name, slug, position, is_won, is_lost, pipeline)
    values
      (c.company_id, 'Em contato', 'em-contato', 301, false, false, 'trafego'),
      (c.company_id, 'Sem resposta', 'sem-resposta', 302, false, false, 'trafego');

    -- "Novo lead" continua em 1º: o webhook do WhatsApp coloca os leads novos na 1ª etapa.
    update public.pipeline_stages
    set position = case slug
        when 'novo-lead' then 1
        when 'em-contato' then 2
        when 'sem-resposta' then 3
        when 'a-contatar' then 4
        when 'contato-feito' then 5
        when 'respondeu' then 6
        when 'qualificado' then 7
        when 'reuniao' then 8
        when 'venda' then 9
        when 'desqualificado' then 10
        else position
      end
    where company_id = c.company_id;
  end loop;
end $$;
