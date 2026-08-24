import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { OverviewDashboard } from '@/components/overview-dashboard'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
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

  const [companyResult, stagesResult, leadsResult, historyResult] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .single(),
      supabase
        .from('pipeline_stages')
        .select('id, name, slug, is_won, is_lost')
        .eq('company_id', companyId)
        .order('position'),
      supabase
        .from('leads')
        .select('id, stage_id, sale_value, created_at')
        .eq('company_id', companyId),
      supabase
        .from('lead_history')
        .select('id, lead_id, event_type, to_stage_id, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true }),
    ])

  const company = companyResult.data
  const stages = stagesResult.data
  const leads = leadsResult.data
  const history = historyResult.data

  return (
    <CrmShell
      companyName={company?.name ?? 'Empresa'}
      role={membership.role}
      activeItem="overview"
    >
      <OverviewDashboard
        leads={leads ?? []}
        stages={stages ?? []}
        history={history ?? []}
      />
    </CrmShell>
  )
}
