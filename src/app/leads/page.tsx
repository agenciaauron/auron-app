import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { LeadsWorkspace } from '@/components/leads-workspace'
import { NewLeadForm } from '@/components/new-lead-form'
import { getCrmContext, loadTeam } from '@/lib/crm-context'
import {
  ACTIVITY_SELECT,
  HISTORY_SELECT,
  LEAD_SELECT,
  STAGE_SELECT,
  type Activity,
  type HistoryItem,
  type Lead,
  type Stage,
} from '@/lib/lead-types'

export default async function LeadsPage() {
  const { supabase, userId, companyId, role } = await getCrmContext()

  if (!userId) {
    redirect('/login')
  }

  if (!companyId || !role) {
    return (
      <main className="min-h-screen bg-ink-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  const [companyResult, stagesResult, leadsResult, historyResult, activitiesResult, team] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .single(),
      supabase
        .from('pipeline_stages')
        .select(STAGE_SELECT)
        .eq('company_id', companyId)
        .order('position'),
      supabase
        .from('leads')
        .select(LEAD_SELECT)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('lead_history')
        .select(HISTORY_SELECT)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('lead_activities')
        .select(ACTIVITY_SELECT)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      loadTeam(supabase, companyId),
    ])

  const company = companyResult.data

  return (
    <CrmShell
      companyName={company?.name ?? 'Empresa'}
      role={role}
      activeItem="leads"
    >
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Leads</p>
          <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">
            Gestão de leads
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Trabalhe o funil do tráfego e da prospecção ou consulte toda a base em lista.
          </p>
        </div>

        <NewLeadForm />
      </header>

      <LeadsWorkspace
        stages={(stagesResult.data ?? []) as Stage[]}
        leads={(leadsResult.data ?? []) as Lead[]}
        history={(historyResult.data ?? []) as HistoryItem[]}
        activities={(activitiesResult.data ?? []) as Activity[]}
        team={team}
        role={role}
      />
    </CrmShell>
  )
}
