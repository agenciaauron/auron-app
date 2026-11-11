'use client'

import { useState } from 'react'
import { CalendarCheck, HandCoins, KanbanSquare, type LucideIcon } from 'lucide-react'
import { CommissionsWorkspace } from '@/components/commissions-workspace'
import { SdrLeadsWorkspace } from '@/components/sdr-leads-workspace'
import { SdrNewLeadForm } from '@/components/sdr-new-lead-form'
import { TodayWorkspace } from '@/components/today-workspace'
import type { TeamMember } from '@/lib/crm'
import type { Activity, HistoryItem, Lead, Stage } from '@/lib/lead-types'

type Tab = 'hoje' | 'funil' | 'comissoes'

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'hoje', label: 'Hoje', icon: CalendarCheck },
  { key: 'funil', label: 'Funil', icon: KanbanSquare },
  { key: 'comissoes', label: 'Comissões', icon: HandCoins },
]

type Props = {
  userId: string
  role: string
  firstName: string | null
  stages: Stage[]
  leads: Lead[]
  history: HistoryItem[]
  activities: Activity[]
  team: TeamMember[]
}

// Tudo do SDR numa aba só: fila do dia, funil (tráfego e prospecção) e comissões.
export function SdrWorkspace({ userId, role, firstName, stages, leads, history, activities, team }: Props) {
  const [tab, setTab] = useState<Tab>('hoje')

  const sales = leads.filter((lead) => lead.won_at)
  const meetings = activities.filter(
    (item) => item.type === 'reuniao_marcada' || item.type === 'reuniao_realizada'
  )

  return (
    <>
      <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Comercial</p>
          <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">
            {firstName ? `Bom trabalho, ${firstName}` : 'Comercial'}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Atendimento, prospecção, follow-ups, reuniões e comissões.
          </p>
        </div>

        <SdrNewLeadForm />
      </header>

      {/* Sem overflow aqui: a borda de baixo das abas gerava uma barrinha de rolagem. */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-ink-800" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.key
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${
                active
                  ? 'border-auron-400 font-semibold text-ink-50'
                  : 'border-transparent text-ink-400 hover:text-ink-200'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'hoje' && (
        <TodayWorkspace
          userId={userId}
          role={role}
          stages={stages}
          leads={leads}
          history={history}
          activities={activities}
          team={team}
        />
      )}

      {tab === 'funil' && (
        <SdrLeadsWorkspace
          stages={stages}
          leads={leads}
          history={history}
          activities={activities}
          team={team}
          role={role}
        />
      )}

      {tab === 'comissoes' && (
        <CommissionsWorkspace userId={userId} role={role} sales={sales} meetings={meetings} team={team} />
      )}
    </>
  )
}
