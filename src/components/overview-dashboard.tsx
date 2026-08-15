'use client'

import { useMemo, useState } from 'react'

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
  estimated_value: number | string | null
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

type Period = '7d' | '30d' | 'month'
type Metric = 'leads' | 'qualified' | 'meetings' | 'sales' | 'lost' | 'revenue'

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

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPeriodRange(period: Period) {
  const now = new Date()

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
    <span className={`text-xs ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? '↑' : '↓'} {Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

export function OverviewDashboard({ leads, stages, history }: Props) {
  const [period, setPeriod] = useState<Period>('month')
  const [metric, setMetric] = useState<Metric>('leads')

  const range = useMemo(() => getPeriodRange(period), [period])

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages]
  )

  const leadMap = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead])),
    [leads]
  )

  function stageMatches(stageId: string | null, target: 'qualified' | 'meetings' | 'sales' | 'lost') {
    if (!stageId) return false
    const stage = stageMap.get(stageId)
    if (!stage) return false

    if (target === 'sales') return stage.is_won
    if (target === 'lost') return stage.is_lost

    const searchable = normalize(`${stage.slug} ${stage.name}`)
    if (target === 'qualified') return searchable.includes('qualific')
    return searchable.includes('reuniao')
  }

  function metricEvents(selectedMetric: Metric): MetricEvent[] {
    if (selectedMetric === 'leads') {
      return leads.map((lead) => ({
        date: new Date(lead.created_at),
        value: 1,
      }))
    }

    return history.flatMap((item) => {
      const date = new Date(item.created_at)

      if (selectedMetric === 'qualified' && stageMatches(item.to_stage_id, 'qualified')) {
        return [{ date, value: 1 }]
      }

      if (selectedMetric === 'meetings' && stageMatches(item.to_stage_id, 'meetings')) {
        return [{ date, value: 1 }]
      }

      if (selectedMetric === 'sales' && stageMatches(item.to_stage_id, 'sales')) {
        return [{ date, value: 1 }]
      }

      if (selectedMetric === 'lost' && stageMatches(item.to_stage_id, 'lost')) {
        return [{ date, value: 1 }]
      }

      if (selectedMetric === 'revenue' && stageMatches(item.to_stage_id, 'sales')) {
        const lead = leadMap.get(item.lead_id)
        return [{
          date,
          value: Number(lead?.sale_value ?? lead?.estimated_value ?? 0),
        }]
      }

      return []
    })
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
  const previousEvents = metricEvents(metric).filter((event) =>
    inRange(event.date, range.prevStart, range.prevEnd)
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
  const previousSeries = makeDailySeries(previousEvents, range.prevStart, range.prevEnd)
  const pointCount = Math.max(currentSeries.length, previousSeries.length, 2)
  const maxValue = Math.max(
    1,
    ...currentSeries.map((item) => item.value),
    ...previousSeries.map((item) => item.value)
  )

  const width = 1000
  const height = 300
  const paddingX = 44
  const paddingTop = 24
  const paddingBottom = 40
  const plotHeight = height - paddingTop - paddingBottom
  const plotWidth = width - paddingX * 2

  function points(series: Array<{ value: number }>) {
    return series
      .map((item, index) => {
        const x = paddingX + (index / Math.max(pointCount - 1, 1)) * plotWidth
        const y = paddingTop + plotHeight - (item.value / maxValue) * plotHeight
        return `${x},${y}`
      })
      .join(' ')
  }

  const selectedMetricLabel = metricOptions.find((item) => item.value === metric)?.label ?? ''
  const currentTotal = totalInRange(metric, range.start, range.end)
  const previousTotal = totalInRange(metric, range.prevStart, range.prevEnd)
  const metricFormatter = metric === 'revenue' ? formatCurrency : (value: number) => value.toLocaleString('pt-BR')

  const xLabels = currentSeries.length > 0
    ? [
        currentSeries[0],
        currentSeries[Math.floor((currentSeries.length - 1) / 2)],
        currentSeries[currentSeries.length - 1],
      ]
    : []

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-purple-400">Visão geral</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Desempenho comercial</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Compare a evolução dos seus leads e resultados ao longo do tempo.
          </p>
        </div>

        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 outline-none"
        >
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="month">Este mês</option>
        </select>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.metric}
            type="button"
            onClick={() => setMetric(card.metric)}
            className={`rounded-2xl border p-5 text-left transition ${
              metric === card.metric
                ? 'border-purple-500/50 bg-purple-500/5'
                : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-500">{card.label}</p>
              <Comparison current={card.value} previous={card.previous} />
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight">
              {card.formatter(card.value)}
            </p>
            <p className="mt-2 text-xs text-zinc-600">comparado ao período anterior</p>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-zinc-500">Evolução no período</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <p className="text-3xl font-semibold tracking-tight">
                {metricFormatter(currentTotal)}
              </p>
              <Comparison current={currentTotal} previous={previousTotal} />
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              {range.currentLabel} comparado com {range.previousLabel.toLowerCase()}
            </p>
          </div>

          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as Metric)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-200 outline-none"
          >
            {metricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 flex flex-wrap gap-5 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="h-0.5 w-6 bg-purple-500" />
            {range.currentLabel}
          </div>
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="w-6 border-t border-dashed border-zinc-500" />
            {range.previousLabel}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[290px] w-full" role="img" aria-label={`Gráfico de ${selectedMetricLabel}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = paddingTop + plotHeight * ratio
              return (
                <line
                  key={ratio}
                  x1={paddingX}
                  x2={width - paddingX}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-zinc-800"
                  strokeWidth="1"
                />
              )
            })}

            {previousSeries.length > 0 && (
              <polyline
                fill="none"
                stroke="currentColor"
                className="text-zinc-500"
                strokeWidth="3"
                strokeDasharray="8 8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points(previousSeries)}
              />
            )}

            {currentSeries.length > 0 && (
              <polyline
                fill="none"
                stroke="currentColor"
                className="text-purple-500"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points(currentSeries)}
              />
            )}

            <text x={paddingX} y={18} fill="currentColor" className="text-zinc-600" fontSize="12">
              {metric === 'revenue' ? formatCurrency(maxValue) : maxValue.toLocaleString('pt-BR')}
            </text>
            <text x={paddingX} y={height - 8} fill="currentColor" className="text-zinc-600" fontSize="12">
              {xLabels[0]?.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </text>
            <text x={width / 2} y={height - 8} textAnchor="middle" fill="currentColor" className="text-zinc-600" fontSize="12">
              {xLabels[1]?.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </text>
            <text x={width - paddingX} y={height - 8} textAnchor="end" fill="currentColor" className="text-zinc-600" fontSize="12">
              {xLabels[2]?.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </text>
          </svg>
        </div>
      </section>
    </>
  )
}
