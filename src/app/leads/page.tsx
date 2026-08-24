import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { LeadsWorkspace } from '@/components/leads-workspace'
import { NewLeadForm } from '@/components/new-lead-form'
import { createClient } from '@/lib/supabase/server'

export default async function LeadsPage() {
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
        .select('id, name, position, is_won, is_lost')
        .eq('company_id', companyId)
        .order('position'),
      supabase
        .from('leads')
        .select(
          'id, name, phone, email, source, campaign, notes, stage_id, sale_value, created_at'
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('lead_history')
        .select(
          'id, lead_id, event_type, from_stage_id, to_stage_id, created_at'
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
    ])

  const company = companyResult.data
  const stages = stagesResult.data
  const leads = leadsResult.data
  const history = historyResult.data

  return (
    <CrmShell
      companyName={company?.name ?? 'Empresa'}
      role={membership.role}
      activeItem="leads"
    >
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-purple-400">Leads</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Gestão de leads
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Trabalhe o funil comercial ou consulte toda a sua base em lista.
          </p>
        </div>

        <NewLeadForm />
      </header>

      <LeadsWorkspace
        stages={stages ?? []}
        leads={leads ?? []}
        history={history ?? []}
      />
    </CrmShell>
  )
}
