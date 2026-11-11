import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { TodayWorkspace } from '@/components/today-workspace'
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

export default async function TodayPage() {
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

  const firstName = team.find((member) => member.user_id === userId)?.name.split(' ')[0]

  return (
    <CrmShell companyName={companyResult.data?.name ?? 'Empresa'} role={role} activeItem="today">
      <header className="mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Hoje</p>
        <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">
          {firstName && firstName !== 'Sem' ? `Bom trabalho, ${firstName}` : 'O que fazer hoje'}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Leads esperando resposta, follow-ups e reuniões do dia, em ordem de prioridade.
        </p>
      </header>

      <TodayWorkspace
        userId={userId}
        role={role}
        stages={(stagesResult.data ?? []) as Stage[]}
        leads={(leadsResult.data ?? []) as Lead[]}
        history={(historyResult.data ?? []) as HistoryItem[]}
        activities={(activitiesResult.data ?? []) as Activity[]}
        team={team}
      />
    </CrmShell>
  )
}
