import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { FinanceWorkspace } from '@/components/finance-workspace'
import { createClient } from '@/lib/supabase/server'
import { isManager } from '@/lib/crm'
import { loadTeam } from '@/lib/crm-context'

export default async function FinancePage() {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!membership) {
    return (
      <main className="min-h-screen bg-ink-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  // SDR só acessa a aba Comercial.
  if (!isManager(membership.role)) {
    redirect('/comercial')
  }

  const companyId = membership.company_id

  const [companyResult, clientsResult, paymentsResult, expensesResult, recurringResult, settingsResult, leadsResult, meetingsResult, team] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single(),
    supabase
      .from('finance_clients')
      .select('id, name, monthly_amount, due_day, billing_cycle, second_due_day, billing_start, status, notes, channel, ended_at, created_at, updated_at')
      .eq('company_id', companyId)
      .order('name'),
    supabase
      .from('finance_payments')
      .select('id, finance_client_id, competence, installment, due_date, paid_at, amount, payment_method, notes, created_at')
      .eq('company_id', companyId)
      .order('paid_at', { ascending: false }),
    supabase
      .from('finance_expenses')
      .select('id, spent_at, amount, category, channel, description, recurring_id, source')
      .eq('company_id', companyId)
      .order('spent_at', { ascending: false }),
    supabase
      .from('finance_recurring_expenses')
      .select('id, name, amount, category, channel, starts_on, ends_on')
      .eq('company_id', companyId)
      .order('name'),
    supabase.from('finance_settings').select('profit_goal').eq('company_id', companyId).maybeSingle(),
    // Vendas (comissão do SDR) e desempenho do SDR.
    supabase
      .from('leads')
      .select('id, name, origin, sdr_id, sale_value, won_at, created_at')
      .eq('company_id', companyId),
    supabase
      .from('lead_activities')
      .select('user_id, created_at')
      .eq('company_id', companyId)
      .eq('type', 'reuniao_marcada'),
    loadTeam(supabase, companyId),
  ])

  const company = companyResult.data
  const financeReady = !clientsResult.error && !paymentsResult.error

  return (
    <CrmShell
      companyName={company?.name ?? 'Empresa'}
      role={membership.role}
      activeItem="finance"
    >
      <FinanceWorkspace
        clients={clientsResult.data ?? []}
        payments={paymentsResult.data ?? []}
        financeReady={financeReady}
        expenses={expensesResult.data ?? []}
        recurring={recurringResult.data ?? []}
        profitGoal={settingsResult.data?.profit_goal != null ? Number(settingsResult.data.profit_goal) : null}
        leads={leadsResult.data ?? []}
        meetings={meetingsResult.data ?? []}
        team={team}
      />
    </CrmShell>
  )
}
