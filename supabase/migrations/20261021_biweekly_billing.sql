-- Cobrança quinzenal: o cliente pode pagar duas vezes no mês, cada parcela com
-- vencimento e status próprios. Clientes existentes continuam mensais.

alter table public.finance_clients
  add column if not exists billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'biweekly')),
  add column if not exists second_due_day smallint
    check (second_due_day between 1 and 31);

alter table public.finance_payments
  add column if not exists installment smallint not null default 1
    check (installment in (1, 2));

-- Um pagamento por parcela (antes era um por mês).
alter table public.finance_payments
  drop constraint if exists finance_payments_finance_client_id_competence_key;

alter table public.finance_payments
  add constraint finance_payments_client_competence_installment_key
  unique (finance_client_id, competence, installment);
