'use client'

import { ReactNode, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Send } from 'lucide-react'
import { MeetingDialog, type MeetingDialogMode } from '@/components/meeting-dialog'
import { SdrLeadDetails } from '@/components/sdr-lead-details'
import { displayMessage, formatPhone, isTemplateMessage, templateMessages, whatsappUrl } from '@/lib/lead-cleanup'
import {
  NO_SHOW_LIMIT,
  ORIGIN_LABELS,
  conversationStatus,
  dueLabel,
  dueState,
  formatDateTime,
  normalizeOrigin,
  withStageTouches,
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

// Leads que mandaram mensagem há mais de 3 dias saem da fila de "Responder agora"
// (continuam com o selo verde no funil).
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

// Mensagem pronta para confirmar a reunião pelo WhatsApp.
function confirmationText(lead: Lead, now: number) {
  const meeting = new Date(lead.meeting_at!)
  const todayStart = startOfDay(now)
  const day =
    meeting.getTime() < todayStart + 86400000
      ? 'hoje'
      : meeting.getTime() < todayStart + 2 * 86400000
        ? 'amanhã'
        : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(meeting)
  const firstName = lead.name.trim().split(/\s+/)[0]
  return `Oi, ${firstName}! Tudo bem? Passando para confirmar nossa conversa ${day} às ${timeOf(lead.meeting_at!)}. Podemos manter?`
}

export function TodayWorkspace({ userId, role, stages, leads, history, activities, team }: Props) {
  const router = useRouter()
  const [now] = useState(() => Date.now())
  const [savingMeeting, setSavingMeeting] = useState<string | null>(null)
  const [savingAttempt, setSavingAttempt] = useState<string | null>(null)
  const [meetingDialog, setMeetingDialog] = useState<{ lead: Lead; mode: MeetingDialogMode } | null>(null)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  const stageMap = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages])
  const templates = useMemo(() => templateMessages(leads), [leads])
  const openLead = leads.find((lead) => lead.id === openLeadId)

  const groups = useMemo(() => {
    const todayStart = startOfDay(now)
    const tomorrowStart = todayStart + 86400000

    const active = leads.filter((lead) => {
      const stage = lead.stage_id ? stageMap.get(lead.stage_id) : undefined
      return !stage?.is_won && !stage?.is_lost
    })

    const touches = withStageTouches(activities, history, stages)
    const status = new Map(active.map((lead) => [lead.id, conversationStatus(lead, touches, now)]))

    // O lead mandou mensagem e é a vez do SDR (verde no funil).
    const waiting = active
      .filter((lead) => status.get(lead.id)?.kind === 'sua_vez')
      .map((lead) => ({ lead, incoming: new Date(lead.last_message_at ?? lead.created_at).getTime() }))
      .filter(({ incoming }) => now - incoming < WAITING_WINDOW_HOURS * 3600000)
      .sort((a, b) => a.incoming - b.incoming)
    const waitingIds = new Set(waiting.map(({ lead }) => lead.id))

    const byNextAction = (a: Lead, b: Lead) =>
      new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime()
    const byMeeting = (a: Lead, b: Lead) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime()

    // Faltou na reunião: fica numa lista própria, com Remarcar/Desistiu.
    const noShows = active.filter(
      (lead) => lead.meeting_status === 'nao_compareceu' || lead.meeting_status === 'desmarcada'
    )

    // Último motivo de falta/desmarcação de cada lead.
    const missReason = new Map<string, string>()
    for (const item of [...activities].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if ((item.type === 'nao_compareceu' || item.type === 'reuniao_desmarcada') && item.note) {
        missReason.set(item.lead_id, item.note)
      }
    }
    const noShowIds = new Set(noShows.map((lead) => lead.id))

    const followUps = active.filter(
      (lead) => lead.next_action_at && !waitingIds.has(lead.id) && !noShowIds.has(lead.id)
    )
    const overdue = followUps.filter((lead) => dueState(lead.next_action_at!, now) === 'overdue').sort(byNextAction)
    const dueToday = followUps.filter((lead) => dueState(lead.next_action_at!, now) === 'today').sort(byNextAction)

    const scheduled = leads.filter((lead) => lead.meeting_at && lead.meeting_status === 'agendada')

    const meetingsToday = scheduled
      .filter((lead) => {
        const time = new Date(lead.meeting_at!).getTime()
        return time >= todayStart && time < tomorrowStart
      })
      .sort(byMeeting)

    const meetingsPending = scheduled.filter((lead) => new Date(lead.meeting_at!).getTime() < todayStart).sort(byMeeting)
    const meetingsTomorrow = scheduled
      .filter((lead) => {
        const time = new Date(lead.meeting_at!).getTime()
        return time >= tomorrowStart && time < tomorrowStart + 86400000
      })
      .sort(byMeeting)
    const upcomingMeetings = scheduled
      .filter((lead) => new Date(lead.meeting_at!).getTime() >= tomorrowStart + 86400000)
      .sort(byMeeting)

    // Confirmada = registrou "Confirmou a reunião" depois do último agendamento.
    const confirmed = new Set<string>()
    for (const lead of scheduled) {
      const marks = activities.filter((item) => item.lead_id === lead.id)
      const lastScheduled = Math.max(
        0,
        ...marks
          .filter((item) => item.type === 'reuniao_marcada' || item.type === 'reuniao_remarcada')
          .map((item) => new Date(item.created_at).getTime())
      )
      if (
        marks.some((item) => item.type === 'reuniao_confirmada' && new Date(item.created_at).getTime() > lastScheduled)
      ) {
        confirmed.add(lead.id)
      }
    }

    const entryStage = stages.find((stage) => stage.slug === 'novo-lead')
    const noNextStep = active.filter(
      (lead) =>
        !lead.next_action_at &&
        !(lead.meeting_at && lead.meeting_status === 'agendada') &&
        !waitingIds.has(lead.id) &&
        !noShowIds.has(lead.id) &&
        lead.stage_id !== entryStage?.id
    )

    const myActivitiesToday = activities.filter(
      (item) => item.user_id === userId && new Date(item.created_at).getTime() >= todayStart
    ).length

    return {
      status,
      missReason,
      waiting,
      overdue,
      dueToday,
      noShows,
      meetingsToday,
      meetingsTomorrow,
      meetingsPending,
      upcomingMeetings,
      confirmed,
      noNextStep,
      myActivitiesToday,
    }
  }, [leads, stages, stageMap, activities, history, now, userId])

  // "Mandei mensagem" direto da lista: registra e agenda o próximo follow-up sozinho.
  async function logMessage(leadId: string) {
    setSavingAttempt(leadId)
    const response = await fetch('/api/leads/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, type: 'mensagem' }),
    })
    const result = await response.json()
    setSavingAttempt(null)

    if (!response.ok) {
      alert(result.error || 'Não foi possível registrar.')
      return
    }

    router.refresh()
  }

  async function setMeetingResult(leadId: string, status: 'realizada' | 'confirmar') {
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
          onClick={() => setMeetingDialog({ lead, mode: 'nao_compareceu' })}
          className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          Não veio
        </button>
        {cancelButton(lead)}
      </>
    )
  }

  function cancelButton(lead: Lead) {
    return (
      <button
        type="button"
        onClick={() => setMeetingDialog({ lead, mode: 'desmarcada' })}
        className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-yellow-400/40 hover:text-yellow-200"
      >
        Desmarcou
      </button>
    )
  }

  function messageButton(lead: Lead, label = 'Mandei mensagem') {
    return (
      <button
        type="button"
        disabled={savingAttempt === lead.id}
        onClick={() => logMessage(lead.id)}
        title="Registra a mensagem e agenda o próximo follow-up"
        className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-auron-500/50 hover:text-auron-200 disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {savingAttempt === lead.id ? 'Salvando…' : label}
      </button>
    )
  }

  // Confirmar reunião: abre o WhatsApp com a mensagem pronta e registra a confirmação.
  function confirmButton(lead: Lead) {
    if (groups.confirmed.has(lead.id)) {
      return (
        <>
          <span className="text-xs font-medium text-emerald-300">Confirmada</span>
          {cancelButton(lead)}
        </>
      )
    }
    const url = whatsappUrl(lead.phone, confirmationText(lead, now))
    return (
      <>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-whatsapp/40 px-3 py-1.5 text-xs font-medium text-whatsapp transition hover:bg-whatsapp/10"
          >
            Mensagem de confirmação
          </a>
        )}
        <button
          type="button"
          disabled={savingMeeting === lead.id}
          onClick={() => setMeetingResult(lead.id, 'confirmar')}
          className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
        >
          Confirmou
        </button>
        {cancelButton(lead)}
      </>
    )
  }

  function nextActionText(lead: Lead) {
    const status = groups.status.get(lead.id)
    const due = `${dueLabel(lead.next_action_at!, now)}${lead.next_action_note ? ` · ${lead.next_action_note}` : ''}`
    return status && status.kind !== 'aguardando' ? `${status.text} · ${due}` : due
  }

  function followUpTone(lead: Lead, fallback: Tone): Tone {
    const kind = groups.status.get(lead.id)?.kind
    if (kind === 'nunca_respondeu') return 'urgent'
    if (kind === 'parou_de_responder') return 'attention'
    return fallback
  }

  const sections: { key: string; title: string; hint: string; items: ReactNode[] }[] = [
    {
      key: 'waiting',
      title: 'Responder agora',
      hint: 'O lead mandou mensagem e é a sua vez. Respondeu? Clique em "Respondi".',
      items: groups.waiting.map(({ lead, incoming }) => {
        const message = isTemplateMessage(lead.last_message, templates) ? null : displayMessage(lead.last_message)
        return leadRow(
          lead,
          `${message ? `“${message}” · ` : ''}esperando ${waitingLabel(incoming, now)}`,
          now - incoming > 15 * 60000 ? 'urgent' : 'attention',
          messageButton(lead, 'Respondi')
        )
      }),
    },
    {
      key: 'meetings-today',
      title: 'Reuniões de hoje',
      hint: 'Confirme antes; depois da reunião, marque o resultado.',
      items: groups.meetingsToday.map((lead) =>
        leadRow(
          lead,
          `Reunião às ${timeOf(lead.meeting_at!)}`,
          'info',
          new Date(lead.meeting_at!).getTime() <= now ? meetingButtons(lead) : confirmButton(lead)
        )
      ),
    },
    {
      key: 'meetings-pending',
      title: 'Reuniões sem resultado',
      hint: 'Já passaram: aconteceu ou faltou?',
      items: groups.meetingsPending.map((lead) =>
        leadRow(lead, `Era ${formatDateTime(lead.meeting_at)}`, 'attention', meetingButtons(lead))
      ),
    },
    {
      key: 'no-shows',
      title: 'Faltaram ou desmarcaram',
      hint: 'Chame no WhatsApp e reagende. Desistiu? Abra a ficha.',
      items: groups.noShows.map((lead) => {
        const status = groups.status.get(lead.id)
        const reason = groups.missReason.get(lead.id)
        return leadRow(
          lead,
          `${status?.text ?? 'Faltou na reunião'}${reason ? ` · ${reason}` : ''}${
            lead.meeting_at ? ` · era ${formatDateTime(lead.meeting_at)}` : ''
          }`,
          (status?.noShows ?? 0) >= NO_SHOW_LIMIT ? 'urgent' : 'attention',
          <button
            type="button"
            onClick={() => setMeetingDialog({ lead, mode: 'remarcar' })}
            className="rounded-lg border border-yellow-400/40 px-3 py-1.5 text-xs font-medium text-yellow-200 transition hover:bg-yellow-400/10"
          >
            Reagendar
          </button>
        )
      }),
    },
    {
      key: 'meetings-tomorrow',
      title: 'Confirmar reuniões de amanhã',
      hint: 'Mande a mensagem de confirmação: diminui a chance de o lead faltar.',
      items: groups.meetingsTomorrow.map((lead) =>
        leadRow(lead, `Amanhã às ${timeOf(lead.meeting_at!)}`, 'info', confirmButton(lead))
      ),
    },
    {
      key: 'overdue',
      title: 'Follow-ups atrasados',
      hint: 'Mandou? Clique em "Mandei mensagem": o próximo follow-up é agendado sozinho.',
      items: groups.overdue.map((lead) => leadRow(lead, nextActionText(lead), followUpTone(lead, 'urgent'), messageButton(lead))),
    },
    {
      key: 'today',
      title: 'Follow-ups de hoje',
      hint: 'Contatos marcados para hoje.',
      items: groups.dueToday.map((lead) => leadRow(lead, nextActionText(lead), followUpTone(lead, 'attention'), messageButton(lead))),
    },
    {
      key: 'no-next',
      title: 'Sem próximo passo',
      hint: 'Leads em andamento sem follow-up marcado.',
      items: groups.noNextStep.map((lead) => leadRow(lead, 'Nenhum próximo contato marcado', 'neutral', messageButton(lead))),
    },
    {
      key: 'upcoming',
      title: 'Próximas reuniões',
      hint: 'Agendadas a partir de depois de amanhã.',
      items: groups.upcomingMeetings.map((lead) => leadRow(lead, formatDateTime(lead.meeting_at), 'neutral')),
    },
  ]

  const stats = [
    { label: 'Responder agora', value: groups.waiting.length, urgent: groups.waiting.length > 0 },
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

      {meetingDialog && (
        <MeetingDialog
          leadId={meetingDialog.lead.id}
          leadName={meetingDialog.lead.name}
          mode={meetingDialog.mode}
          onCancel={() => setMeetingDialog(null)}
          onDone={() => {
            setMeetingDialog(null)
            router.refresh()
          }}
        />
      )}

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
