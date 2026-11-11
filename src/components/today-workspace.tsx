'use client'

import { ReactNode, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { SdrLeadDetails } from '@/components/sdr-lead-details'
import { displayMessage, formatPhone, isTemplateMessage, templateMessages, whatsappUrl } from '@/lib/lead-cleanup'
import {
  ORIGIN_LABELS,
  dueLabel,
  dueState,
  formatDateTime,
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

type Tone = 'urgent' | 'attention' | 'info' | 'neutral'

// Leads que mandaram mensagem há mais de 3 dias saem da fila de "esperando resposta".
const WAITING_WINDOW_HOURS = 72

const TONE_DOT: Record<Tone, string> = {
  urgent: 'bg-rose-400',
  attention: 'bg-amber-300',
  info: 'bg-auron-400',
  neutral: 'bg-ink-600',
}

function waitingLabel(since: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - since) / 60000))
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

function startOfDay(now: number) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function timeOf(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(value))
}

export function TodayWorkspace({ userId, role, stages, leads, history, activities, team }: Props) {
  const router = useRouter()
  const [now] = useState(() => Date.now())
  const [savingMeeting, setSavingMeeting] = useState<string | null>(null)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  const stageMap = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages])
  const templates = useMemo(() => templateMessages(leads), [leads])
  const openLead = leads.find((lead) => lead.id === openLeadId)

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
      .map((lead) => ({ lead, incoming: new Date(lead.last_message_at ?? lead.created_at).getTime() }))
      .filter(
        ({ lead, incoming }) =>
          now - incoming < WAITING_WINDOW_HOURS * 3600000 && (lastTouch.get(lead.id) ?? 0) < incoming
      )
      .sort((a, b) => a.incoming - b.incoming)

    const byNextAction = (a: Lead, b: Lead) =>
      new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime()
    const byMeeting = (a: Lead, b: Lead) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime()

    const overdue = active
      .filter((lead) => lead.next_action_at && dueState(lead.next_action_at, now) === 'overdue')
      .sort(byNextAction)

    const dueToday = active
      .filter((lead) => lead.next_action_at && dueState(lead.next_action_at, now) === 'today')
      .sort(byNextAction)

    const scheduled = leads.filter((lead) => lead.meeting_at && lead.meeting_status === 'agendada')

    const meetingsToday = scheduled
      .filter((lead) => {
        const time = new Date(lead.meeting_at!).getTime()
        return time >= todayStart && time < tomorrowStart
      })
      .sort(byMeeting)

    const meetingsPending = scheduled.filter((lead) => new Date(lead.meeting_at!).getTime() < todayStart).sort(byMeeting)
    const upcomingMeetings = scheduled
      .filter((lead) => new Date(lead.meeting_at!).getTime() >= tomorrowStart)
      .sort(byMeeting)

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

  function leadRow(lead: Lead, detail: ReactNode, tone: Tone, extra?: ReactNode) {
    const stage = lead.stage_id ? stageMap.get(lead.stage_id) : undefined
    const waUrl = whatsappUrl(lead.phone)

    return (
      <li key={lead.id} className="group flex items-center gap-4 px-4 py-3 transition hover:bg-ink-900/70">
        <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />

        <button type="button" onClick={() => setOpenLeadId(lead.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-ink-50 group-hover:text-auron-200">{lead.name}</p>
            <span className="shrink-0 text-xs text-ink-500">
              {stage?.name ?? 'Sem etapa'} · {ORIGIN_LABELS[normalizeOrigin(lead.origin)]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-400">{detail}</p>
        </button>

        {lead.phone && (
          <span className="hidden shrink-0 font-mono text-xs text-ink-500 lg:block">{formatPhone(lead.phone)}</span>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {extra}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir conversa no WhatsApp"
              aria-label={`Abrir conversa com ${lead.name} no WhatsApp`}
              className="rounded-lg border border-ink-800 p-2 text-ink-400 transition hover:border-whatsapp/40 hover:bg-whatsapp/10 hover:text-whatsapp"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
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
          className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
        >
          Aconteceu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMeetingResult(lead.id, 'nao_compareceu')}
          className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          Não veio
        </button>
      </>
    )
  }

  function nextActionText(lead: Lead) {
    return `${dueLabel(lead.next_action_at!, now)}${lead.next_action_note ? ` · ${lead.next_action_note}` : ''}`
  }

  const sections: { key: string; title: string; hint: string; items: ReactNode[] }[] = [
    {
      key: 'waiting',
      title: 'Esperando resposta',
      hint: 'Leads do tráfego que mandaram mensagem. Responda e registre na ficha.',
      items: groups.waiting.map(({ lead, incoming }) => {
        const message = isTemplateMessage(lead.last_message, templates) ? null : displayMessage(lead.last_message)
        return leadRow(
          lead,
          `${message ? `“${message}” · ` : ''}esperando ${waitingLabel(incoming, now)}`,
          now - incoming > 15 * 60000 ? 'urgent' : 'attention'
        )
      }),
    },
    {
      key: 'meetings-today',
      title: 'Reuniões de hoje',
      hint: 'Depois da reunião, marque o resultado.',
      items: groups.meetingsToday.map((lead) =>
        leadRow(
          lead,
          `Reunião às ${timeOf(lead.meeting_at!)}`,
          'info',
          new Date(lead.meeting_at!).getTime() <= now ? meetingButtons(lead) : undefined
        )
      ),
    },
    {
      key: 'meetings-pending',
      title: 'Reuniões sem resultado',
      hint: 'Já passaram: diga se aconteceram.',
      items: groups.meetingsPending.map((lead) =>
        leadRow(lead, `Era ${formatDateTime(lead.meeting_at)}`, 'attention', meetingButtons(lead))
      ),
    },
    {
      key: 'overdue',
      title: 'Follow-ups atrasados',
      hint: 'Faça o contato e marque o próximo passo.',
      items: groups.overdue.map((lead) => leadRow(lead, nextActionText(lead), 'urgent')),
    },
    {
      key: 'today',
      title: 'Follow-ups de hoje',
      hint: 'Contatos marcados para hoje.',
      items: groups.dueToday.map((lead) => leadRow(lead, nextActionText(lead), 'attention')),
    },
    {
      key: 'no-next',
      title: 'Sem próximo passo',
      hint: 'Leads em andamento sem follow-up marcado.',
      items: groups.noNextStep.map((lead) => leadRow(lead, 'Nenhum próximo contato marcado', 'neutral')),
    },
    {
      key: 'upcoming',
      title: 'Próximas reuniões',
      hint: 'Agendadas a partir de amanhã.',
      items: groups.upcomingMeetings.map((lead) => leadRow(lead, formatDateTime(lead.meeting_at), 'neutral')),
    },
  ]

  const stats = [
    { label: 'Esperando resposta', value: groups.waiting.length, urgent: groups.waiting.length > 0 },
    { label: 'Follow-ups atrasados', value: groups.overdue.length, urgent: groups.overdue.length > 0 },
    { label: 'Para hoje', value: groups.dueToday.length + groups.meetingsToday.length, urgent: false },
    { label: 'Suas atividades hoje', value: groups.myActivitiesToday, urgent: false },
  ]

  const visibleSections = sections.filter((section) => section.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((card) => (
          <div key={card.label} className="rounded-2xl border border-ink-800 bg-ink-900/50 px-5 py-4">
            <p className="flex items-center gap-2 text-xs text-ink-500">
              {card.urgent && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden />}
              {card.label}
            </p>
            <p className="mt-1.5 font-display text-2xl font-semibold tabular text-ink-50">{card.value}</p>
          </div>
        ))}
      </div>

      {visibleSections.length === 0 && (
        <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6 text-sm text-ink-300">
          Tudo em dia por aqui. Bom momento para prospectar novos leads.
        </div>
      )}

      {visibleSections.map((section) => (
        <section key={section.key} className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950/60">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink-800/80 px-4 py-3">
            <h2 className="font-display text-[15px] font-semibold text-ink-50">{section.title}</h2>
            <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-semibold tabular text-ink-300">
              {section.items.length}
            </span>
            <p className="text-xs text-ink-500">{section.hint}</p>
          </header>
          <ul className="divide-y divide-ink-800/60">{section.items}</ul>
        </section>
      ))}

      {openLead && (
        <SdrLeadDetails
          key={openLead.id}
          lead={openLead}
          stages={stages}
          history={history.filter((item) => item.lead_id === openLead.id)}
          activities={activities.filter((item) => item.lead_id === openLead.id)}
          team={team}
          role={role}
          open
          onClose={() => setOpenLeadId(null)}
        />
      )}
    </div>
  )
}
