'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SdrLeadDetails } from '@/components/sdr-lead-details'
import { MEETING_STATUS_LABELS, type MeetingStatus, type TeamMember } from '@/lib/crm'
import type { Activity, HistoryItem, Lead, Stage } from '@/lib/lead-types'

type Props = {
  stages: Stage[]
  leads: Lead[]
  history: HistoryItem[]
  activities: Activity[]
  team: TeamMember[]
  role: string
}

type View = 'mes' | 'semana'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Cor de cada reunião pela situação.
const STATUS_STYLE: Record<string, string> = {
  agendada: 'border-auron-500/40 bg-auron-500/15 text-auron-100',
  realizada: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  nao_compareceu: 'border-red-500/30 bg-red-500/10 text-red-200',
  desmarcada: 'border-ink-700 bg-ink-800/60 text-ink-400 line-through',
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

type Meeting = { lead: Lead; at: Date; status: string }

// Calendário das reuniões marcadas (data e hora que vocês colocam ao mover o lead para Reunião).
export function MeetingsCalendar({ stages, leads, history, activities, team, role }: Props) {
  const [view, setView] = useState<View>('semana')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const today = dayKey(new Date())

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const lead of leads) {
      if (!lead.meeting_at) continue
      const at = new Date(lead.meeting_at)
      const key = dayKey(at)
      const list = map.get(key) ?? []
      list.push({ lead, at, status: lead.meeting_status ?? 'agendada' })
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime())
    return map
  }, [leads])

  // Dias que aparecem: a semana (dom a sáb) ou o mês inteiro em semanas completas.
  const days = useMemo(() => {
    if (view === 'semana') {
      const start = addDays(cursor, -cursor.getDay())
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = addDays(first, -first.getDay())
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const end = addDays(last, 6 - last.getDay())
    const list: Date[] = []
    for (let day = start; day <= end; day = addDays(day, 1)) list.push(day)
    return list
  }, [view, cursor])

  const title =
    view === 'mes'
      ? capitalize(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor))
      : `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(days[0])} a ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(days[6])}`

  const scheduledInView = days.reduce(
    (sum, day) => sum + (byDay.get(dayKey(day)) ?? []).filter((item) => item.status === 'agendada').length,
    0
  )

  function move(direction: -1 | 1) {
    setCursor((current) =>
      view === 'semana'
        ? addDays(current, 7 * direction)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1)
    )
  }

  const sdrName = (id: string | null) => (id ? team.find((member) => member.user_id === id)?.name : null)
  const openLead = openLeadId ? leads.find((lead) => lead.id === openLeadId) : null

  function chip(item: Meeting, compact: boolean) {
    const label = MEETING_STATUS_LABELS[item.status as MeetingStatus] ?? item.status
    return (
      <button
        key={item.lead.id}
        type="button"
        onClick={() => setOpenLeadId(item.lead.id)}
        title={`${timeLabel(item.at)} · ${item.lead.name} · ${label}${sdrName(item.lead.sdr_id) ? ` · ${sdrName(item.lead.sdr_id)}` : ''}`}
        className={`block w-full rounded-md border px-2 text-left transition hover:brightness-125 ${
          compact ? 'py-0.5 text-[11px]' : 'py-1.5 text-xs'
        } ${STATUS_STYLE[item.status] ?? STATUS_STYLE.agendada}`}
      >
        <span className="font-semibold tabular">{timeLabel(item.at)}</span>{' '}
        <span className={compact ? 'truncate' : ''}>{item.lead.name}</span>
        {!compact && item.status !== 'agendada' && <span className="mt-0.5 block text-[10px] opacity-80">{label}</span>}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(startOfDay(new Date()))}
            className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-ink-300 transition hover:bg-ink-800"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-2 font-display text-lg font-semibold text-ink-100">{title}</h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-500">
            {scheduledInView} {scheduledInView === 1 ? 'reunião agendada' : 'reuniões agendadas'}
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-ink-700 bg-ink-950 p-1">
            {(
              [
                ['semana', 'Semana'],
                ['mes', 'Mês'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  view === key ? 'bg-auron-600 text-white' : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-ink-500">
        {(['agendada', 'realizada', 'nao_compareceu', 'desmarcada'] as const).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm border ${STATUS_STYLE[status]}`} aria-hidden />
            {MEETING_STATUS_LABELS[status]}
          </span>
        ))}
      </div>

      {/* Calendário (telas maiores) */}
      <div className="hidden overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/45 md:block">
        <div className="grid grid-cols-7 border-b border-ink-800 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-2">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day)
            const items = byDay.get(key) ?? []
            const outside = view === 'mes' && day.getMonth() !== cursor.getMonth()
            const isToday = key === today
            return (
              <div
                key={key}
                className={`border-b border-r border-ink-800/70 p-1.5 ${view === 'semana' ? 'min-h-[260px]' : 'min-h-[110px]'} ${
                  outside ? 'bg-ink-950/60' : ''
                }`}
              >
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs tabular ${
                      isToday ? 'bg-auron-600 font-semibold text-white' : outside ? 'text-ink-700' : 'text-ink-400'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {view === 'semana' && items.length > 0 && (
                    <span className="text-[10px] text-ink-600">{items.length}</span>
                  )}
                </div>
                <div className="space-y-1">{items.map((item) => chip(item, view === 'mes'))}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista por dia (celular) */}
      <div className="space-y-3 md:hidden">
        {days
          .filter((day) => (byDay.get(dayKey(day)) ?? []).length > 0)
          .map((day) => (
            <div key={dayKey(day)} className="rounded-xl border border-ink-800 bg-ink-900/45 p-3">
              <p className={`mb-2 text-sm font-semibold ${dayKey(day) === today ? 'text-auron-300' : 'text-ink-200'}`}>
                {capitalize(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(day))}
              </p>
              <div className="space-y-1.5">{(byDay.get(dayKey(day)) ?? []).map((item) => chip(item, false))}</div>
            </div>
          ))}
        {days.every((day) => (byDay.get(dayKey(day)) ?? []).length === 0) && (
          <p className="rounded-xl border border-dashed border-ink-800 px-4 py-8 text-center text-sm text-ink-600">
            Nenhuma reunião neste período.
          </p>
        )}
      </div>

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
