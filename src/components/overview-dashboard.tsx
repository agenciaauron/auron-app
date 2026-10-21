'use client'

import { useMemo, useState } from 'react'
import { BadgeCheck, CircleDollarSign, Handshake, Inbox, type LucideIcon } from 'lucide-react'
import { InteractivePerformanceChart } from '@/components/interactive-performance-chart'

const metricIcons: Partial<Record<Metric, LucideIcon>> = {
  leads: Inbox,
  qualified: BadgeCheck,
  sales: Handshake,
  revenue: CircleDollarSign,
}

type Stage = {
  id: string
  name: string
  slug: string
  is_won: boolean
  is_lost: boolean
}

type Lead = {
  id: string
  stage_id: string | null
  sale_value: number | string | null
  created_at: string
}

type HistoryItem = {
  id: string
  lead_id: string
  event_type: string
  to_stage_id: string | null
  created_at: string
}

type Props = {
  leads: Lead[]
  stages: Stage[]
  history: HistoryItem[]
}

type Period = '7d' | '30d' | 'month' | 'custom'
type Metric = 'leads' | 'qualified' | 'meetings' | 'sales' | 'lost' | 'revenue'
type StageMetric = 'qualified' | 'meetings' | 'sales' | 'lost'

type MetricEvent = {
  date: Date
  value: number
}

const metricOptions: Array<{ value: Metric; label: string }> = [
  { value: 'leads', label: 'Total de leads' },
  { value: 'qualified', label: 'Leads qualificados' },
  { value: 'meetings', label: 'Reuniões' },
  { value: 'sales', label: 'Vendas' },
  { value: 'lost', label: 'Leads perdidos' },
  { value: 'revenue', label: 'Valor vendido' },
]

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateToInputValue(date: Date) {
  return localDateKey(date)
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

function formatRangeLabel(start: Date, end: Date) {
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()

  if (sameMonth) {
    return `${start.toLocaleDateString('pt-BR', { day: '2-digit' })}–${end.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })}`
  }

  return `${start.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })} – ${end.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })}`
}

function getPeriodRange(period: Period, customStart: string, customEnd: string) {
  const now = new Date()

  if (period === 'custom') {
    const parsedStart = parseDateInput(customStart)
    const parsedEnd = parseDateInput(customEnd)

    const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const fallbackEnd = now

    const firstDate = parsedStart ?? fallbackStart
    const secondDate = parsedEnd ?? fallbackEnd

    const start = startOfDay(firstDate <= secondDate ? firstDate : secondDate)
    const end = endOfDay(firstDate <= secondDate ? secondDate : firstDate)

    const dayCount =
      Math.floor((startOfDay(end).getTime() - start.getTime()) / 86400000) + 1

    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = startOfDay(
      new Date(start.getTime() - dayCount * 86400000)
    )

    return {
      start,
      end,
      prevStart,
      prevEnd,
      currentLabel: formatRangeLabel(start, end),
      previousLabel: formatRangeLabel(prevStart, prevEnd),
    }
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastDayPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    const prevEnd = new Date(
      prevStart.getFullYear(),
      prevStart.getMonth(),
      Math.min(now.getDate(), lastDayPreviousMonth),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    )

    return {
      start,
      end: now,
      prevStart,
      prevEnd,
      currentLabel: 'Este mês',
      previousLabel: 'Mesmo período do mês anterior',
    }
  }

  const days = period === '7d' ? 7 : 30
  const start = startOfDay(new Date(now.getTime() - (days - 1) * 86400000))
  const duration = now.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - duration)

  return {
    start,
    end: now,
    prevStart,
    prevEnd,
    currentLabel: `Últimos ${days} dias`,
    previousLabel: `${days} dias anteriores`,
  }
}

function inRange(date: Date, start: Date, end: Date) {
  return date >= start && date <= end
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100
  }

  return ((current - previous) / Math.abs(previous)) * 100
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function Comparison({ current, previous }: { current: number; previous: number }) {
  const change = percentageChange(current, previous)
  const positive = change >= 0

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular ${
        positive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
      }`}
    >
      {positive ? '↑' : '↓'} {Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

export function OverviewDashboard({ leads, stages, history }: Props) {
  const now = new Date()
  const [period, setPeriod] = useState<Period>('month')
  const [metric, setMetric] = useState<Metric>('leads')
  const [customStart, setCustomStart] = useState(
    dateToInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
  )
  const [customEnd, setCustomEnd] = useState(dateToInputValue(now))

  const range = useMemo(
    () => getPeriodRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  )

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages]
  )

  const leadMap = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead])),
    [leads]
  )

  function stageMatches(stageId: string | null, target: StageMetric) {
    if (!stageId) return false
    const stage = stageMap.get(stageId)
    if (!stage) return false

    if (target === 'sales') return stage.is_won
    if (target === 'lost') return stage.is_lost

    const searchable = normalize(`${stage.slug} ${stage.name}`)
    if (target === 'qualified') return !stage.is_lost && searchable.includes('qualific')
    return searchable.includes('reuniao')
  }

  function firstStageEvents(target: StageMetric) {
    const firstEventByLead = new Map<string, HistoryItem>()

    const orderedHistory = [...history].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    for (const item of orderedHistory) {
      if (!stageMatches(item.to_stage_id, target)) continue
      if (firstEventByLead.has(item.lead_id)) continue

      firstEventByLead.set(item.lead_id, item)
    }

    return Array.from(firstEventByLead.values())
  }

  function metricEvents(selectedMetric: Metric): MetricEvent[] {
    if (selectedMetric === 'leads') {
      return leads.map((lead) => ({
        date: new Date(lead.created_at),
        value: 1,
      }))
    }

    if (selectedMetric === 'revenue') {
      return firstStageEvents('sales').map((item) => {
        const lead = leadMap.get(item.lead_id)

        return {
          date: new Date(item.created_at),
          value: Number(lead?.sale_value ?? 0),
        }
      })
    }

    return firstStageEvents(selectedMetric).map((item) => ({
      date: new Date(item.created_at),
      value: 1,
    }))
  }

  function totalInRange(selectedMetric: Metric, start: Date, end: Date) {
    return metricEvents(selectedMetric)
      .filter((event) => inRange(event.date, start, end))
      .reduce((total, event) => total + event.value, 0)
  }

  const cards = [
    {
      label: 'Leads recebidos',
      metric: 'leads' as const,
      value: totalInRange('leads', range.start, range.end),
      previous: totalInRange('leads', range.prevStart, range.prevEnd),
      formatter: (value: number) => value.toLocaleString('pt-BR'),
    },
    {
      label: 'Leads qualificados',
      metric: 'qualified' as const,
      value: totalInRange('qualified', range.start, range.end),
      previous: totalInRange('qualified', range.prevStart, range.prevEnd),
      formatter: (value: number) => value.toLocaleString('pt-BR'),
    },
    {
      label: 'Vendas',
      metric: 'sales' as const,
      value: totalInRange('sales', range.start, range.end),
      previous: totalInRange('sales', range.prevStart, range.prevEnd),
      formatter: (value: number) => value.toLocaleString('pt-BR'),
    },
    {
      label: 'Valor vendido',
      metric: 'revenue' as const,
      value: totalInRange('revenue', range.start, range.end),
      previous: totalInRange('revenue', range.prevStart, range.prevEnd),
      formatter: formatCurrency,
    },
  ]

  const currentEvents = metricEvents(metric).filter((event) =>
    inRange(event.date, range.start, range.end)
  )

  function makeDailySeries(events: MetricEvent[], start: Date, end: Date) {
    const values = new Map<string, number>()

    for (const event of events) {
      const key = localDateKey(event.date)
      values.set(key, (values.get(key) ?? 0) + event.value)
    }

    const series: Array<{ date: Date; value: number }> = []
    const cursor = startOfDay(start)
    const finalDay = startOfDay(end)

    while (cursor <= finalDay) {
      series.push({
        date: new Date(cursor),
        value: values.get(localDateKey(cursor)) ?? 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    return series
  }

  const currentSeries = makeDailySeries(currentEvents, range.start, range.end)

  const selectedMetricLabel = metricOptions.find((item) => item.value === metric)?.label ?? ''
  const currentTotal = totalInRange(metric, range.start, range.end)
  const metricFormatter = metric === 'revenue'
    ? formatCurrency
    : (value: number) => value.toLocaleString('pt-BR')

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Visão geral</p>
          <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">Desempenho comercial</h1>
          <p className="mt-2 text-sm text-ink-500">
            Compare a evolução dos seus leads e resultados ao longo do tempo.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {period === 'custom' && (
            <>
              <label className="text-xs text-ink-500">
                <span className="mb-1 block">De</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-sm text-ink-200 outline-none"
                />
              </label>

              <label className="text-xs text-ink-500">
                <span className="mb-1 block">Até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-sm text-ink-200 outline-none"
                />
              </label>
            </>
          )}

          <label className="text-xs text-ink-500">
            <span className="mb-1 block">Período</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              className="min-w-[170px] rounded-lg border border-ink-800 bg-ink-900 px-4 py-2.5 text-sm text-ink-200 outline-none"
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="month">Este mês</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
        </div>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.metric}
            type="button"
            onClick={() => setMetric(card.metric)}
            className={`rounded-2xl border p-5 text-left transition ${
              metric === card.metric
                ? 'border-auron-500/50 bg-auron-500/5'
                : 'border-ink-800 bg-ink-900/60 hover:border-ink-700'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-ink-400">
                {(() => {
                  const Icon = metricIcons[card.metric]
                  return Icon ? (
                    <Icon className="h-4 w-4 text-auron-300" strokeWidth={1.75} aria-hidden />
                  ) : null
                })()}
                {card.label}
              </p>
              <Comparison current={card.value} previous={card.previous} />
            </div>
            <p className="mt-4 font-display text-3xl font-semibold tracking-tight tabular text-ink-50">
              {card.formatter(card.value)}
            </p>
            <p className="mt-2 text-xs text-ink-600">comparado ao período anterior</p>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/50 p-5 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-ink-500">Evolução no período</p>
            <p className="mt-2 font-display text-3xl font-semibold tracking-tight tabular text-ink-50">
              {metricFormatter(currentTotal)}
            </p>
            <p className="mt-2 text-xs text-ink-600">{range.currentLabel}</p>
          </div>

          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as Metric)}
            className="rounded-lg border border-ink-800 bg-ink-950 px-4 py-2.5 text-sm text-ink-200 outline-none"
          >
            {metricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <InteractivePerformanceChart
          currentSeries={currentSeries}
          metricLabel={selectedMetricLabel}
          currency={metric === 'revenue'}
        />
      </section>
    </>
  )
}
