import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { FinanceWorkspace } from '@/components/finance-workspace'
import { createClient } from '@/lib/supabase/server'

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
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  const companyId = membership.company_id

  const [companyResult, clientsResult, paymentsResult] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single(),
    supabase
      .from('finance_clients')
      .select('id, name, monthly_amount, due_day, status, notes, created_at, updated_at')
      .eq('company_id', companyId)
      .order('name'),
    supabase
      .from('finance_payments')
      .select('id, finance_client_id, competence, due_date, paid_at, amount, payment_method, notes, created_at')
      .eq('company_id', companyId)
      .order('paid_at', { ascending: false }),
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
      />
    </CrmShell>
  )
}
