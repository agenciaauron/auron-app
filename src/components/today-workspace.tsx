'use client'

import { ReactNode, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlarmClock, CalendarCheck, CircleCheck, Inbox, MessageCircle, Route, UserX } from 'lucide-react'
import { SdrLeadDetails } from '@/components/sdr-lead-details'
import { formatPhone, whatsappUrl } from '@/lib/lead-cleanup'
import {
  ORIGIN_LABELS,
  dueLabel,
  dueState,
  formatDateTime,
  isManager,
  normalizeOrigin,
  type TeamMember,
} from '@/lib/crm'
import type { Activity, HistoryItem, Lead, Stage } from '@/lib/lead-types'

type Props = {
  userId: string
  role: string
  stages: Stage[]
  leads: Lead[]
  history: HistoryItem[]
  activities: Activity[]
  team: TeamMember[]
}

// Leads que mandaram mensagem há mais de 3 dias saem da fila de "esperando resposta".
const WAITING_WINDOW_HOURS = 72

function waitingLabel(since: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - since) / 60000))
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)} dia(s)`
}

function startOfDay(now: number) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function TodayWorkspace({ userId, role, stages, leads, history, activities, team }: Props) {
  const router = useRouter()
  const [now] = useState(() => Date.now())
  const [savingMeeting, setSavingMeeting] = useState<string | null>(null)

  const stageMap = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages])

  const lastTouch = useMemo(() => {
    const map = new Map<string, number>()
    activities.forEach((item) => {
      const time = new Date(item.created_at).getTime()
      if (time > (map.get(item.lead_id) ?? 0)) map.set(item.lead_id, time)
    })
    return map
  }, [activities])

  const groups = useMemo(() => {
    const todayStart = startOfDay(now)
    const tomorrowStart = todayStart + 86400000

    const active = leads.filter((lead) => {
      const stage = lead.stage_id ? stageMap.get(lead.stage_id) : undefined
      return !stage?.is_won && !stage?.is_lost
    })

    const entryTrafficStage = stages.find(
      (stage) => !stage.is_won && !stage.is_lost && (stage.pipeline ?? 'ambos') !== 'prospeccao'
    )

    // Lead mandou mensagem e ninguém registrou contato depois disso.
    const waiting = active
      .filter((lead) => normalizeOrigin(lead.origin) === 'trafego')
      .map((lead) => {
        const incoming = new Date(lead.last_message_at ?? lead.created_at).getTime()
        return { lead, incoming }
      })
      .filter(
        ({ lead, incoming }) =>
          now - incoming < WAITING_WINDOW_HOURS * 3600000 && (lastTouch.get(lead.id) ?? 0) < incoming
      )
      .sort((a, b) => a.incoming - b.incoming)

    const overdue = active
      .filter((lead) => lead.next_action_at && dueState(lead.next_action_at, now) === 'overdue')
      .sort((a, b) => new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime())

    const dueToday = active
      .filter((lead) => lead.next_action_at && dueState(lead.next_action_at, now) === 'today')
      .sort((a, b) => new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime())

    const meetingsToday = leads
      .filter((lead) => {
        if (!lead.meeting_at || lead.meeting_status !== 'agendada') return false
        const time = new Date(lead.meeting_at).getTime()
        return time >= todayStart && time < tomorrowStart
      })
      .sort((a, b) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime())

    const meetingsPending = leads
      .filter(
        (lead) =>
          lead.meeting_at &&
          lead.meeting_status === 'agendada' &&
          new Date(lead.meeting_at).getTime() < todayStart
      )
      .sort((a, b) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime())

    const upcomingMeetings = leads
      .filter(
        (lead) =>
          lead.meeting_at &&
          lead.meeting_status === 'agendada' &&
          new Date(lead.meeting_at).getTime() >= tomorrowStart
      )
      .sort((a, b) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime())

    const waitingIds = new Set(waiting.map(({ lead }) => lead.id))
    const noNextStep = active.filter(
      (lead) =>
        !lead.next_action_at &&
        !(lead.meeting_at && lead.meeting_status === 'agendada') &&
        !waitingIds.has(lead.id) &&
        lead.stage_id !== entryTrafficStage?.id
    )

    const myActivitiesToday = activities.filter(
      (item) => item.user_id === userId && new Date(item.created_at).getTime() >= todayStart
    ).length

    return { waiting, overdue, dueToday, meetingsToday, meetingsPending, upcomingMeetings, noNextStep, myActivitiesToday }
  }, [leads, stages, stageMap, activities, lastTouch, now, userId])

  async function setMeetingResult(leadId: string, status: 'realizada' | 'nao_compareceu') {
    setSavingMeeting(leadId)
    const response = await fetch('/api/leads/meeting', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, status }),
    })
    const result = await response.json()
    setSavingMeeting(null)

    if (!response.ok) {
      alert(result.error || 'Não foi possível salvar o resultado.')
      return
    }

    router.refresh()
  }

  function leadRow(lead: Lead, detail: ReactNode, tone = 'text-ink-400', extra?: ReactNode) {
    const stage = lead.stage_id ? stageMap.get(lead.stage_id) : undefined
    const waUrl = whatsappUrl(lead.phone)

    return (
      <li
        key={lead.id}
        className="flex flex-col gap-3 rounded-xl border border-ink-800/80 bg-ink-900 px-4 py-3 sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SdrLeadDetails
              lead={lead}
              stages={stages}
              history={history.filter((item) => item.lead_id === lead.id)}
              activities={activities.filter((item) => item.lead_id === lead.id)}
              team={team}
              role={role}
              triggerLabel={lead.name}
              triggerClassName="truncate text-left text-[15px] font-semibold text-ink-50 hover:text-auron-300"
            />
            <span className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-300">
              {stage?.name ?? 'Sem etapa'}
            </span>
            <span className="text-[11px] text-ink-500">{ORIGIN_LABELS[normalizeOrigin(lead.origin)]}</span>
          </div>
          <p className={`mt-1 truncate text-sm ${tone}`}>{detail}</p>
          {lead.phone && <p className="mt-0.5 font-mono text-xs text-ink-500">{formatPhone(lead.phone)}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {extra}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-whatsapp/15 px-3 py-2 text-sm font-semibold text-whatsapp transition hover:bg-whatsapp/25"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
              WhatsApp
            </a>
          )}
        </div>
      </li>
    )
  }

  function meetingButtons(lead: Lead) {
    const busy = savingMeeting === lead.id
    return (
      <>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMeetingResult(lead.id, 'realizada')}
          className="rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
        >
          Aconteceu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMeetingResult(lead.id, 'nao_compareceu')}
          className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
        >
          Não compareceu
        </button>
      </>
    )
  }

  const sections: {
    key: string
    title: string
    hint: string
    icon: typeof Inbox
    accent: string
    items: ReactNode[]
  }[] = [
    {
      key: 'waiting',
      title: 'Leads do tráfego esperando resposta',
      hint: 'Responda e registre "Mandou mensagem" na ficha para tirar daqui.',
      icon: Inbox,
      accent: 'text-rose-300',
      items: groups.waiting.map(({ lead, incoming }) =>
        leadRow(
          lead,
          `${lead.last_message ? `“${lead.last_message}” · ` : ''}esperando ${waitingLabel(incoming, now)}`,
          now - incoming > 15 * 60000 ? 'text-rose-300' : 'text-amber-300'
        )
      ),
    },
    {
      key: 'meetings-today',
      title: 'Reuniões de hoje',
      hint: 'Depois da reunião, marque o resultado.',
      icon: CalendarCheck,
      accent: 'text-auron-300',
      items: groups.meetingsToday.map((lead) =>
        leadRow(
          lead,
          `Reunião às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(lead.meeting_at!))}`,
          'text-auron-300',
          new Date(lead.meeting_at!).getTime() <= now ? meetingButtons(lead) : undefined
        )
      ),
    },
    {
      key: 'meetings-pending',
      title: 'Reuniões sem resultado',
      hint: 'Já passaram: diga se aconteceram.',
      icon: UserX,
      accent: 'text-amber-300',
      items: groups.meetingsPending.map((lead) =>
        leadRow(lead, `Era ${formatDateTime(lead.meeting_at)}`, 'text-amber-300', meetingButtons(lead))
      ),
    },
    {
      key: 'overdue',
      title: 'Follow-ups atrasados',
      hint: 'Faça o contato e marque o próximo passo.',
      icon: AlarmClock,
      accent: 'text-rose-300',
      items: groups.overdue.map((lead) =>
        leadRow(
          lead,
          `${dueLabel(lead.next_action_at!, now)}${lead.next_action_note ? ` · ${lead.next_action_note}` : ''}`,
          'text-rose-300'
        )
      ),
    },
    {
      key: 'today',
      title: 'Follow-ups de hoje',
      hint: 'Contatos marcados para hoje.',
      icon: CircleCheck,
      accent: 'text-amber-300',
      items: groups.dueToday.map((lead) =>
        leadRow(
          lead,
          `${dueLabel(lead.next_action_at!, now)}${lead.next_action_note ? ` · ${lead.next_action_note}` : ''}`,
          'text-amber-300'
        )
      ),
    },
    {
      key: 'no-next',
      title: 'Sem próximo passo',
      hint: 'Leads em andamento sem follow-up marcado. Abra a ficha e marque o próximo contato.',
      icon: Route,
      accent: 'text-ink-300',
      items: groups.noNextStep.map((lead) => leadRow(lead, 'Nenhum próximo contato marcado')),
    },
  ]

  const totalPending = groups.waiting.length + groups.overdue.length + groups.dueToday.length

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Esperando resposta', value: groups.waiting.length, tone: 'text-rose-300' },
          { label: 'Follow-ups atrasados', value: groups.overdue.length, tone: 'text-rose-300' },
          { label: 'Follow-ups e reuniões hoje', value: groups.dueToday.length + groups.meetingsToday.length, tone: 'text-amber-300' },
          { label: 'Suas atividades hoje', value: groups.myActivitiesToday, tone: 'text-emerald-300' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
            <p className="text-xs uppercase tracking-wider text-ink-500">{card.label}</p>
            <p className={`mt-2 font-display text-3xl font-semibold tabular ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {totalPending === 0 && groups.meetingsToday.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-200">
          Tudo em dia por aqui. Bom momento para prospectar novos leads.
        </div>
      )}

      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => {
          const Icon = section.icon
          return (
            <section key={section.key}>
              <div className="mb-3 flex items-baseline gap-3">
                <Icon className={`h-4 w-4 self-center ${section.accent}`} strokeWidth={2} aria-hidden />
                <h2 className="font-display text-lg font-semibold text-ink-50">{section.title}</h2>
                <span className="text-sm text-ink-500">{section.items.length}</span>
              </div>
              <p className="-mt-2 mb-3 text-xs text-ink-500">{section.hint}</p>
              <ul className="space-y-2">{section.items}</ul>
            </section>
          )
        })}

      {groups.upcomingMeetings.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline gap-3">
            <CalendarCheck className="h-4 w-4 self-center text-ink-400" strokeWidth={2} aria-hidden />
            <h2 className="font-display text-lg font-semibold text-ink-50">Próximas reuniões</h2>
            <span className="text-sm text-ink-500">{groups.upcomingMeetings.length}</span>
          </div>
          <ul className="space-y-2">
            {groups.upcomingMeetings.map((lead) => leadRow(lead, formatDateTime(lead.meeting_at), 'text-ink-300'))}
          </ul>
        </section>
      )}

      {isManager(role) && (
        <p className="text-xs text-ink-600">
          Você vê a fila de toda a equipe. O SDR vê a mesma tela ao entrar no CRM.
        </p>
      )}
    </div>
  )
}
