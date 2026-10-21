'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  CircleDollarSign,
  Handshake,
  Inbox,
  Megaphone,
  RefreshCw,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

type Account = {
  ad_account_id: string
  last_synced_at: string | null
  last_sync_error: string | null
}

type Insight = {
  date: string
  ad_id: string
  ad_name: string | null
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  spend: number | string
  impressions: number
  clicks: number
}

type AdObject = {
  object_id: string
  level: string
  name: string | null
  effective_status: string | null
  campaign_id: string | null
  adset_id: string | null
}

type Stage = {
  id: string
  name: string
  slug: string
  position: number
  is_won: boolean
  is_lost: boolean
}

type Lead = {
  id: string
  stage_id: string | null
  sale_value: number | string | null
  created_at: string
  meta_source_id: string | null
  meta_headline: string | null
  meta_qualified_sent_at: string | null
}

type HistoryItem = {
  lead_id: string
  to_stage_id: string | null
}

type Props = {
  account: Account | null
  insights: Insight[]
  objects: AdObject[]
  stages: Stage[]
  leads: Lead[]
  history: HistoryItem[]
  ready: boolean
}

type Period = 'month' | 'lastMonth' | '7d' | '30d' | '90d' | 'custom'
type Level = 'campaign' | 'adset' | 'ad'
type SortKey = 'spend' | 'leads' | 'cpl' | 'qualified' | 'cpq' | 'sales' | 'cac' | 'revenue' | 'roas'

type Row = {
  key: string
  name: string
  parent: string | null
  matched: boolean
  active: boolean
  spend: number
  leads: number
  qualified: number
  lost: number
  sales: number
  revenue: number
}

// Sincroniza sozinho ao abrir a tela se o último dado da Meta tiver mais de 3 horas.
const autoSyncAfterMs = 3 * 60 * 60 * 1000

// Destaques só consideram linhas com volume mínimo, para um lead isolado não "ganhar".
const minLeadsForHighlight = 3

const levelLabels: Record<Level, string> = {
  campaign: 'Campanhas',
  adset: 'Conjuntos',
  ad: 'Anúncios',
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRange(period: Period, customStart: string, customEnd: string) {
  const now = new Date()
  const today = localDateKey(now)

  if (period === 'custom') {
    const start = customStart || today
    const end = customEnd || today
    return start <= end ? { start, end } : { start: end, end: start }
  }

  if (period === 'month') {
    return { start: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }

  if (period === 'lastMonth') {
    return {
      start: localDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: localDateKey(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  return { start: localDateKey(start), end: today }
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null
}

function money(value: number | null) {
  return value === null ? '—' : formatCurrency(value)
}

function percent(value: number | null) {
  return value === null
    ? '—'
    : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

function roasLabel(value: number | null) {
  return value === null
    ? '—'
    : `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`
}

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.round(hours / 24)} dias`
}

function sortValue(row: Row, key: SortKey) {
  switch (key) {
    case 'cpl':
      return ratio(row.spend, row.leads)
    case 'cpq':
      return ratio(row.spend, row.qualified)
    case 'cac':
      return ratio(row.spend, row.sales)
    case 'roas':
      return ratio(row.revenue, row.spend)
    default:
      return row[key]
  }
}

// Em custo, menor é melhor; nas outras colunas, maior é melhor.
const lowerIsBetter = new Set<SortKey>(['cpl', 'cpq', 'cac'])

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
      <p className="flex items-center gap-2 text-sm text-ink-400">
        <Icon className="h-4 w-4 text-auron-300" strokeWidth={1.75} aria-hidden />
        {label}
      </p>
      <p className="mt-4 font-display text-2xl font-semibold tracking-tight tabular text-ink-50">{value}</p>
      <p className="mt-2 text-xs text-ink-600">{hint}</p>
    </div>
  )
}

function AccountForm({
  initialValue,
  busy,
  onSave,
}: {
  initialValue: string
  busy: boolean
  onSave: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSave(value)
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <label className="flex-1 text-xs text-ink-500">
        <span className="mb-1 block">ID da conta de anúncios</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ex.: 123456789012345"
          inputMode="numeric"
          className="w-full rounded-lg border border-ink-800 bg-ink-950 px-3 py-2.5 font-mono text-sm text-ink-200 outline-none focus:border-auron-500/60"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="rounded-lg bg-auron-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-auron-500 disabled:opacity-50"
      >
        {busy ? 'Conectando…' : 'Salvar e sincronizar'}
      </button>
    </form>
  )
}

export function CampaignsWorkspace({ account, insights, objects, stages, leads, history, ready }: Props) {
  const router = useRouter()
  const [period, setPeriod] = useState<Period>('month')
  const [onlyActive, setOnlyActive] = useState(true)
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set())
  const [selectedAdsets, setSelectedAdsets] = useState<Set<string>>(new Set())
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [level, setLevel] = useState<Level>('campaign')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortAsc, setSortAsc] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [editingAccount, setEditingAccount] = useState(false)
  const autoSynced = useRef(false)

  async function runSync(adAccountId?: string) {
    setSyncing(true)
    setSyncError(null)

    try {
      const response = await fetch('/api/meta-ads', {
        method: adAccountId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: adAccountId ? JSON.stringify({ adAccountId }) : undefined,
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.ok) {
        setSyncError(result.error || 'Não foi possível sincronizar com a Meta.')
      } else {
        setEditingAccount(false)
      }
    } catch {
      setSyncError('Sem conexão com o servidor.')
    } finally {
      setSyncing(false)
      router.refresh()
    }
  }

  useEffect(() => {
    if (autoSynced.current || !account) return
    const stale =
      !account.last_synced_at ||
      objects.length === 0 ||
      Date.now() - new Date(account.last_synced_at).getTime() > autoSyncAfterMs
    if (!stale) return
    const timer = setTimeout(() => {
      autoSynced.current = true
      void runSync()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  const range = useMemo(
    () => getRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  )

  // Status de cada lead no funil, independente do período.
  const leadStatus = useMemo(() => {
    const stageMap = new Map(stages.map((stage) => [stage.id, stage]))
    const qualifiedStage = stages.find(
      (stage) => !stage.is_lost && normalize(`${stage.slug} ${stage.name}`).includes('qualific')
    )

    // Chegou em Qualificado ou em qualquer etapa depois dela (Reunião, Venda).
    function isQualifiedStage(stageId: string | null) {
      const stage = stageId ? stageMap.get(stageId) : null
      if (!stage || stage.is_lost) return false
      if (stage.is_won) return true
      return qualifiedStage ? stage.position >= qualifiedStage.position : false
    }

    const reachedQualified = new Set<string>()
    for (const item of history) {
      if (isQualifiedStage(item.to_stage_id)) reachedQualified.add(item.lead_id)
    }

    const status = new Map<string, { qualified: boolean; won: boolean; lost: boolean; revenue: number }>()
    for (const lead of leads) {
      const stage = lead.stage_id ? stageMap.get(lead.stage_id) : null
      const won = Boolean(stage?.is_won)
      status.set(lead.id, {
        qualified:
          Boolean(lead.meta_qualified_sent_at) ||
          reachedQualified.has(lead.id) ||
          isQualifiedStage(lead.stage_id),
        won,
        lost: Boolean(stage?.is_lost),
        revenue: won ? Number(lead.sale_value ?? 0) : 0,
      })
    }

    return status
  }, [stages, leads, history])

  // Status e nome atuais vindos da Meta, por ID de campanha, conjunto ou anúncio.
  const objectMap = useMemo(
    () => new Map(objects.map((object) => [object.object_id, object])),
    [objects]
  )

  // Campanha e conjunto de cada anúncio, com o nome atual (cadastro da Meta primeiro, gasto como reserva).
  const adInfo = useMemo(() => {
    const map = new Map<string, {
      campaignId: string | null
      campaignName: string | null
      adsetId: string | null
      adsetName: string | null
      adName: string | null
    }>()

    for (const insight of insights) {
      map.set(insight.ad_id, {
        campaignId: insight.campaign_id,
        campaignName: insight.campaign_name,
        adsetId: insight.adset_id,
        adsetName: insight.adset_name,
        adName: insight.ad_name,
      })
    }

    for (const object of objects) {
      if (object.level !== 'ad') continue
      const previous = map.get(object.object_id)
      const campaignId = object.campaign_id ?? previous?.campaignId ?? null
      const adsetId = object.adset_id ?? previous?.adsetId ?? null
      map.set(object.object_id, {
        campaignId,
        campaignName: (campaignId && objectMap.get(campaignId)?.name) || previous?.campaignName || null,
        adsetId,
        adsetName: (adsetId && objectMap.get(adsetId)?.name) || previous?.adsetName || null,
        adName: object.name ?? previous?.adName ?? null,
      })
    }

    return map
  }, [insights, objects, objectMap])

  // Sem status sincronizado ainda, não dá para saber o que está ativo: mostra tudo.
  const statusKnown = objects.length > 0
  const filterActive = onlyActive && statusKnown

  const rows = useMemo(() => {
    const grouped = new Map<string, Row>()

    // Seleção em cascata: conjuntos só das campanhas marcadas, anúncios só dos conjuntos marcados.
    function passesSelection(info: ReturnType<typeof adInfo.get>) {
      if (level === 'campaign') return true
      if (!info) return selectedCampaigns.size === 0 && selectedAdsets.size === 0
      if (selectedCampaigns.size > 0 && !selectedCampaigns.has(info.campaignId ?? '')) return false
      if (level === 'ad' && selectedAdsets.size > 0 && !selectedAdsets.has(info.adsetId ?? '')) return false
      return true
    }

    function groupFor(adId: string, fallbackName: string | null) {
      const info = adInfo.get(adId)
      if (!passesSelection(info)) return null

      let key: string
      let name: string
      let parent: string | null = null

      if (!info) {
        key = level === 'ad' ? `unmatched:${adId}` : 'unmatched'
        name = level === 'ad' ? fallbackName || `Anúncio ${adId}` : 'Sem gasto sincronizado'
      } else if (level === 'campaign') {
        key = info.campaignId || 'none'
        name = info.campaignName || 'Campanha sem nome'
      } else if (level === 'adset') {
        key = info.adsetId || 'none'
        name = info.adsetName || 'Conjunto sem nome'
        parent = info.campaignName
      } else {
        key = adId
        name = info.adName || fallbackName || `Anúncio ${adId}`
        parent = [info.campaignName, info.adsetName].filter(Boolean).join(' · ') || null
      }

      let row = grouped.get(key)
      if (!row) {
        row = {
          key,
          name,
          parent,
          matched: Boolean(info),
          active: objectMap.get(key)?.effective_status === 'ACTIVE',
          spend: 0,
          leads: 0,
          qualified: 0,
          lost: 0,
          sales: 0,
          revenue: 0,
        }
        grouped.set(key, row)
      }
      return row
    }

    for (const insight of insights) {
      if (insight.date < range.start || insight.date > range.end) continue
      const row = groupFor(insight.ad_id, null)
      if (row) row.spend += Number(insight.spend)
    }

    // Leads que entraram no período, com o que aconteceu com eles depois (qualificação, venda).
    for (const lead of leads) {
      if (!lead.meta_source_id) continue
      const day = localDateKey(new Date(lead.created_at))
      if (day < range.start || day > range.end) continue

      const row = groupFor(lead.meta_source_id, lead.meta_headline)
      if (!row) continue
      const status = leadStatus.get(lead.id)
      row.leads += 1
      if (status?.qualified) row.qualified += 1
      if (status?.lost) row.lost += 1
      if (status?.won) {
        row.sales += 1
        row.revenue += status.revenue
      }
    }

    return Array.from(grouped.values()).filter(
      (row) => (row.spend > 0 || row.leads > 0) && (!filterActive || row.active)
    )
  }, [insights, leads, leadStatus, adInfo, objectMap, level, range, filterActive, selectedCampaigns, selectedAdsets])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      // Linha "sem gasto" sempre no fim: os custos dela não fazem sentido.
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      const va = sortValue(a, sortKey)
      const vb = sortValue(b, sortKey)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return sortAsc ? va - vb : vb - va
    })
  }, [rows, sortKey, sortAsc])

  const levelSelection = level === 'campaign' ? selectedCampaigns : level === 'adset' ? selectedAdsets : null

  // Os cards somam só o que está marcado no nível atual; sem nada marcado, somam a tabela inteira.
  const totals = useMemo(() => {
    const summaryRows =
      levelSelection && levelSelection.size > 0
        ? rows.filter((row) => levelSelection.has(row.key))
        : rows

    return summaryRows.reduce(
      (total, row) => ({
        spend: total.spend + row.spend,
        leads: total.leads + row.leads,
        qualified: total.qualified + row.qualified,
        sales: total.sales + row.sales,
        revenue: total.revenue + row.revenue,
      }),
      { spend: 0, leads: 0, qualified: 0, sales: 0, revenue: 0 }
    )
  }, [rows, levelSelection])

  const highlights = useMemo(() => {
    const eligible = rows.filter((row) => row.matched && row.spend > 0 && row.leads >= minLeadsForHighlight)

    function best(value: (row: Row) => number | null, lower: boolean) {
      let winner: { row: Row; value: number } | null = null
      for (const row of eligible) {
        const current = value(row)
        if (current === null) continue
        if (!winner || (lower ? current < winner.value : current > winner.value)) {
          winner = { row, value: current }
        }
      }
      return winner
    }

    return [
      {
        label: 'Lead qualificado mais barato',
        result: best((row) => ratio(row.spend, row.qualified), true),
        format: (value: number) => money(value),
      },
      {
        label: 'Maior taxa de qualificação',
        result: best((row) => ratio(row.qualified, row.leads), false),
        format: (value: number) => percent(value),
      },
      {
        label: 'Melhor retorno (ROAS)',
        result: best((row) => (row.sales > 0 ? ratio(row.revenue, row.spend) : null), false),
        format: (value: number) => roasLabel(value),
      },
    ]
  }, [rows])

  function toggleSelected(key: string) {
    const setter = level === 'campaign' ? setSelectedCampaigns : setSelectedAdsets
    setter((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    // Trocar as campanhas marcadas invalida os conjuntos escolhidos dentro delas.
    if (level === 'campaign') setSelectedAdsets(new Set())
  }

  // Clicar no nome abre o próximo nível só com aquele item, como no Gerenciador de Anúncios.
  function drillInto(key: string) {
    if (level === 'campaign') {
      setSelectedCampaigns(new Set([key]))
      setSelectedAdsets(new Set())
      setLevel('adset')
    } else if (level === 'adset') {
      setSelectedAdsets(new Set([key]))
      setLevel('ad')
    }
  }

  function clearSelection() {
    setSelectedCampaigns(new Set())
    setSelectedAdsets(new Set())
  }

  function selectionLabel(ids: Set<string>, singular: string, plural: string) {
    if (ids.size === 1) {
      const [id] = Array.from(ids)
      return objectMap.get(id)?.name ?? `1 ${singular}`
    }
    return `${ids.size} ${plural}`
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((current) => !current)
    } else {
      setSortKey(key)
      setSortAsc(lowerIsBetter.has(key))
    }
  }

  const columns: Array<{ key: SortKey; label: string; hint?: string }> = [
    { key: 'spend', label: 'Investimento' },
    { key: 'leads', label: 'Leads' },
    { key: 'cpl', label: 'CPL', hint: 'Investimento ÷ leads' },
    { key: 'qualified', label: 'Qualificados' },
    { key: 'cpq', label: 'Custo / qualif.', hint: 'Investimento ÷ leads qualificados' },
    { key: 'sales', label: 'Vendas' },
    { key: 'cac', label: 'CAC', hint: 'Investimento ÷ vendas' },
    { key: 'revenue', label: 'Valor vendido' },
    { key: 'roas', label: 'ROAS', hint: 'Valor vendido ÷ investimento' },
  ]

  const header = (
    <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Campanhas</p>
        <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">
          Retorno do tráfego pago
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Quanto cada campanha da Meta custou e o que os leads dela viraram no funil.
        </p>
      </div>

      {account && (
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
              <option value="month">Este mês</option>
              <option value="lastMonth">Mês passado</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )

  if (!ready) {
    return (
      <>
        {header}
        <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-6 text-sm text-ink-400">
          As tabelas de campanhas ainda não existem no banco. Rode a migração
          <span className="font-mono text-ink-300"> 20261021_meta_ads_insights.sql</span>.
        </div>
      </>
    )
  }

  if (!account || editingAccount) {
    return (
      <>
        {header}
        <section className="max-w-2xl rounded-2xl border border-ink-800 bg-ink-900/50 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-auron-500/12">
              <Megaphone className="h-5 w-5 text-auron-300" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-ink-50">Conectar conta de anúncios</p>
              <p className="text-sm text-ink-500">
                O ID fica no Gerenciador de Anúncios, ao lado do nome da conta.
              </p>
            </div>
          </div>
          <AccountForm
            initialValue={account?.ad_account_id.replace(/^act_/, '') ?? ''}
            busy={syncing}
            onSave={(value) => void runSync(value)}
          />
          {syncError && <p className="mt-3 text-sm text-rose-300">{syncError}</p>}
          {account && (
            <button
              type="button"
              onClick={() => setEditingAccount(false)}
              className="mt-4 text-sm text-ink-500 hover:text-ink-300"
            >
              Cancelar
            </button>
          )}
        </section>
      </>
    )
  }

  const errorMessage = syncError ?? account.last_sync_error

  return (
    <>
      {header}

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-500">
          Conta <span className="font-mono text-ink-300">{account.ad_account_id.replace(/^act_/, '')}</span>
          {' · '}
          {syncing
            ? 'sincronizando com a Meta…'
            : account.last_synced_at
              ? `atualizado ${timeAgo(account.last_synced_at)}`
              : 'ainda não sincronizado'}
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setEditingAccount(true)}
            className="text-ink-500 hover:text-ink-300"
          >
            Trocar conta
          </button>
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-ink-800 px-3 py-1.5 text-ink-200 transition hover:border-ink-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.75} aria-hidden />
            Atualizar gasto
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={CircleDollarSign}
          label="Investimento"
          value={formatCurrency(totals.spend)}
          hint={`${totals.leads.toLocaleString('pt-BR')} leads no período`}
        />
        <SummaryCard
          icon={Inbox}
          label="CPL"
          value={money(ratio(totals.spend, totals.leads))}
          hint="custo por lead"
        />
        <SummaryCard
          icon={BadgeCheck}
          label="Custo por qualificado"
          value={money(ratio(totals.spend, totals.qualified))}
          hint={`${totals.qualified.toLocaleString('pt-BR')} qualificados · ${percent(ratio(totals.qualified, totals.leads))} dos leads`}
        />
        <SummaryCard
          icon={Handshake}
          label="CAC"
          value={money(ratio(totals.spend, totals.sales))}
          hint={`${totals.sales.toLocaleString('pt-BR')} vendas`}
        />
        <SummaryCard
          icon={TrendingUp}
          label="ROAS"
          value={roasLabel(ratio(totals.revenue, totals.spend))}
          hint={`${formatCurrency(totals.revenue)} vendidos`}
        />
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-3">
        {highlights.map((item) => (
          <div key={item.label} className="rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-500">
              <Trophy className="h-3.5 w-3.5 text-auron-300" strokeWidth={1.75} aria-hidden />
              {item.label}
            </p>
            {item.result ? (
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium text-ink-200" title={item.result.row.name}>
                  {item.result.row.name}
                </p>
                <p className="shrink-0 font-display text-lg font-semibold tabular text-emerald-300">
                  {item.format(item.result.value)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-600">Ainda sem volume para comparar.</p>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/45">
        <div className="flex flex-col gap-3 border-b border-ink-800 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-lg bg-ink-950 p-1" role="tablist" aria-label="Agrupar por">
            {(Object.keys(levelLabels) as Level[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={level === item}
                onClick={() => setLevel(item)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  level === item ? 'bg-auron-500/15 font-semibold text-ink-50' : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                {levelLabels[item]}
                {item === 'campaign' && selectedCampaigns.size > 0 && (
                  <span className="ml-1.5 rounded-full bg-auron-500/25 px-1.5 text-[11px] text-auron-200">
                    {selectedCampaigns.size}
                  </span>
                )}
                {item === 'adset' && selectedAdsets.size > 0 && (
                  <span className="ml-1.5 rounded-full bg-auron-500/25 px-1.5 text-[11px] text-auron-200">
                    {selectedAdsets.size}
                  </span>
                )}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-400">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(event) => setOnlyActive(event.target.checked)}
              className="h-4 w-4 accent-auron-600"
            />
            Só ativos
          </label>
        </div>

        {(selectedCampaigns.size > 0 || selectedAdsets.size > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-3 text-xs">
            <span className="text-ink-500">Filtrando por</span>
            {selectedCampaigns.size > 0 && (
              <span className="max-w-[320px] truncate rounded-full border border-auron-500/30 bg-auron-500/10 px-2.5 py-1 text-auron-200">
                {selectionLabel(selectedCampaigns, 'campanha', 'campanhas')}
              </span>
            )}
            {selectedAdsets.size > 0 && (
              <span className="max-w-[320px] truncate rounded-full border border-auron-500/30 bg-auron-500/10 px-2.5 py-1 text-auron-200">
                {selectionLabel(selectedAdsets, 'conjunto', 'conjuntos')}
              </span>
            )}
            <button type="button" onClick={clearSelection} className="text-ink-500 hover:text-ink-200">
              Limpar seleção
            </button>
          </div>
        )}

        {sortedRows.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">
            {filterActive
              ? 'Nenhum item ativo com gasto ou lead neste período. Desmarque "Só ativos" para ver os pausados.'
              : 'Nenhum gasto ou lead de anúncio neste período.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  {levelSelection && <th className="w-10 py-4 pl-5" aria-label="Selecionar" />}
                  <th className="px-5 py-4 font-medium">{levelLabels[level].slice(0, -1)}</th>
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-4 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        title={column.hint}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-300 ${
                          sortKey === column.key ? 'text-ink-200' : ''
                        }`}
                      >
                        {column.label}
                        {sortKey === column.key &&
                          (sortAsc ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ))}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/80">
                {sortedRows.map((row) => {
                  const selectable = Boolean(levelSelection) && row.matched && row.key !== 'none'
                  const selected = Boolean(levelSelection?.has(row.key))

                  return (
                  <tr
                    key={row.key}
                    className={`transition hover:bg-ink-900/80 ${row.matched ? '' : 'text-ink-500'} ${
                      selected ? 'bg-auron-500/5' : ''
                    }`}
                  >
                    {levelSelection && (
                      <td className="py-4 pl-5">
                        {selectable && (
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${row.name}`}
                            checked={selected}
                            onChange={() => toggleSelected(row.key)}
                            className="h-4 w-4 accent-auron-600"
                          />
                        )}
                      </td>
                    )}
                    <td className="max-w-[320px] px-5 py-4">
                      {selectable ? (
                        <button
                          type="button"
                          onClick={() => drillInto(row.key)}
                          title={`Ver ${level === 'campaign' ? 'conjuntos' : 'anúncios'} de ${row.name}`}
                          className="block max-w-full truncate text-left font-medium text-ink-200 hover:text-auron-300 hover:underline"
                        >
                          {row.name}
                        </button>
                      ) : (
                        <p className="truncate font-medium text-ink-200" title={row.name}>{row.name}</p>
                      )}
                      {row.parent && <p className="mt-1 truncate text-xs text-ink-600">{row.parent}</p>}
                      {statusKnown && row.matched && !row.active && (
                        <p className="mt-1 text-xs text-ink-600">Pausado ou encerrado</p>
                      )}
                      {!row.matched && (
                        <p className="mt-1 text-xs text-ink-600">
                          Anúncio fora da conta conectada ou ainda não sincronizado
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right tabular text-ink-200">{formatCurrency(row.spend)}</td>
                    <td className="px-4 py-4 text-right tabular text-ink-300">{row.leads}</td>
                    <td className="px-4 py-4 text-right tabular text-ink-300">{money(ratio(row.spend, row.leads))}</td>
                    <td className="px-4 py-4 text-right tabular text-ink-300">
                      {row.qualified}
                      <span className="ml-1.5 text-xs text-ink-600">{percent(ratio(row.qualified, row.leads))}</span>
                    </td>
                    <td className="px-4 py-4 text-right tabular font-medium text-ink-100">
                      {money(ratio(row.spend, row.qualified))}
                    </td>
                    <td className="px-4 py-4 text-right tabular text-ink-300">{row.sales}</td>
                    <td className="px-4 py-4 text-right tabular text-ink-300">{money(ratio(row.spend, row.sales))}</td>
                    <td className="px-4 py-4 text-right tabular text-ink-300">{formatCurrency(row.revenue)}</td>
                    <td className="px-4 py-4 text-right tabular font-medium text-ink-100">
                      {roasLabel(ratio(row.revenue, row.spend))}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
