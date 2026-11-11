import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { SdrWorkspace } from '@/components/sdr-workspace'
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

export default async function SdrPage() {
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
      supabase.from('companies').select('id, name').eq('id', companyId).single(),
      supabase.from('pipeline_stages').select(STAGE_SELECT).eq('company_id', companyId).order('position'),
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

  const myName = team.find((member) => member.user_id === userId)?.name
  const firstName = myName && myName !== 'Sem nome' ? myName.split(' ')[0] : null

  return (
    <CrmShell companyName={companyResult.data?.name ?? 'Empresa'} role={role} activeItem="sdr">
      <SdrWorkspace
        userId={userId}
        role={role}
        firstName={firstName}
        stages={(stagesResult.data ?? []) as Stage[]}
        leads={(leadsResult.data ?? []) as Lead[]}
        history={(historyResult.data ?? []) as HistoryItem[]}
        activities={(activitiesResult.data ?? []) as Activity[]}
        team={team}
      />
    </CrmShell>
  )
}
