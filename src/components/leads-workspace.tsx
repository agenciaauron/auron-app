'use client'

import { useMemo, useState } from 'react'
import { CrmPipeline } from '@/components/crm-pipeline'
import { LeadDetails } from '@/components/lead-details'
import { LeadStageSelect } from '@/components/lead-stage-select'

type Stage = {
  id: string
  name: string
  position: number
  is_won: boolean
  is_lost: boolean
}

type Lead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  campaign: string | null
  notes: string | null
  stage_id: string | null
  sale_value: number | string | null
  created_at: string
}

type HistoryItem = {
  id: string
  lead_id: string
  event_type: string
  from_stage_id: string | null
  to_stage_id: string | null
  created_at: string
}

type Props = {
  stages: Stage[]
  leads: Lead[]
  history: HistoryItem[]
}

type View = 'funnel' | 'list'
type SortOrder = 'newest' | 'oldest' | 'name'

function formatCurrency(value: number | string | null) {
  if (value == null) return '—'

  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function LeadsWorkspace({ stages, leads, history }: Props) {
  const [view, setView] = useState<View>('funnel')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map((lead) => lead.source?.trim())
            .filter((source): source is string => Boolean(source))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [leads]
  )

  const campaignOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map((lead) => lead.campaign?.trim())
            .filter((campaign): campaign is string => Boolean(campaign))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [leads]
  )

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase()

    const filtered = leads.filter((lead) => {
      if (stageFilter !== 'all' && lead.stage_id !== stageFilter) return false
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false
      if (campaignFilter !== 'all' && lead.campaign !== campaignFilter) return false

      if (!term) return true

      return [
        lead.name,
        lead.phone,
        lead.email,
        lead.source,
        lead.campaign,
        lead.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })

    return [...filtered].sort((a, b) => {
      if (sortOrder === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }

      if (sortOrder === 'name') {
        return a.name.localeCompare(b.name, 'pt-BR')
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [
    leads,
    search,
    stageFilter,
    sourceFilter,
    campaignFilter,
    sortOrder,
  ])

  const filtersActive =
    Boolean(search.trim()) ||
    stageFilter !== 'all' ||
    sourceFilter !== 'all' ||
    campaignFilter !== 'all'

  function stageName(stageId: string | null) {
    return stages.find((stage) => stage.id === stageId)?.name ?? 'Sem etapa'
  }

  function stageStyle(stageId: string | null) {
    const stage = stages.find((item) => item.id === stageId)

    if (stage?.is_won) {
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    }

    if (stage?.is_lost) {
      return 'border-red-500/20 bg-red-500/10 text-red-300'
    }

    return 'border-purple-500/20 bg-purple-500/10 text-purple-300'
  }

  function clearFilters() {
    setSearch('')
    setStageFilter('all')
    setSourceFilter('all')
    setCampaignFilter('all')
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          <button
            type="button"
            onClick={() => setView('funnel')}
            className={`rounded-md px-4 py-2 text-sm transition ${
              view === 'funnel'
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Funil
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={`rounded-md px-4 py-2 text-sm transition ${
              view === 'list'
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Lista
          </button>
        </div>

        {view === 'list' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-zinc-500">
              <span className="mb-1 block">Buscar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, telefone, e-mail..."
                className="min-w-[250px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-purple-500"
              />
            </label>

            <label className="text-xs text-zinc-500">
              <span className="mb-1 block">Etapa</span>
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 outline-none"
              >
                <option value="all">Todas</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-zinc-500">
              <span className="mb-1 block">Origem</span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 outline-none"
              >
                <option value="all">Todas</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-zinc-500">
              <span className="mb-1 block">Campanha</span>
              <select
                value={campaignFilter}
                onChange={(event) => setCampaignFilter(event.target.value)}
                className="max-w-[190px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 outline-none"
              >
                <option value="all">Todas</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign} value={campaign}>
                    {campaign}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-zinc-500">
              <span className="mb-1 block">Ordenar</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 outline-none"
              >
                <option value="newest">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="name">Nome A–Z</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {view === 'funnel' ? (
        <CrmPipeline stages={stages} leads={leads} history={history} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
              <span className="font-medium text-zinc-200">{filteredLeads.length}</span>{' '}
              {filteredLeads.length === 1 ? 'lead encontrado' : 'leads encontrados'}
              {filteredLeads.length !== leads.length && ` de ${leads.length}`}
            </p>

            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-purple-400 transition hover:text-purple-300"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/45">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-5 py-4 font-medium">Lead</th>
                  <th className="px-5 py-4 font-medium">Origem</th>
                  <th className="px-5 py-4 font-medium">Campanha</th>
                  <th className="px-5 py-4 font-medium">Entrada</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Valor da venda</th>
                  <th className="px-5 py-4 font-medium">Etapa</th>
                  <th className="px-5 py-4 font-medium">Detalhes</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-800/80">
                {filteredLeads.map((lead) => {
                  const leadHistory = history.filter(
                    (item) => item.lead_id === lead.id
                  )
                  const currentStage = stages.find(
                    (stage) => stage.id === lead.stage_id
                  )

                  return (
                    <tr key={lead.id} className="transition hover:bg-zinc-900/80">
                      <td className="px-5 py-4">
                        <p className="font-medium text-zinc-200">{lead.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {lead.phone || lead.email || 'Sem contato informado'}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-zinc-400">
                        {lead.source || '—'}
                      </td>

                      <td className="max-w-[190px] truncate px-5 py-4 text-zinc-500">
                        {lead.campaign || '—'}
                      </td>

                      <td className="px-5 py-4 text-zinc-500">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${stageStyle(
                            lead.stage_id
                          )}`}
                        >
                          {stageName(lead.stage_id)}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-medium">
                        {currentStage?.is_won && lead.sale_value != null ? (
                          <span className="text-emerald-300">
                            {formatCurrency(lead.sale_value)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      <td className="w-[210px] px-5 py-4">
                        <LeadStageSelect
                          leadId={lead.id}
                          currentStageId={lead.stage_id}
                          stages={stages}
                        />
                      </td>

                      <td className="w-[150px] px-5 py-4">
                        <LeadDetails
                          lead={lead}
                          stages={stages}
                          history={leadHistory}
                        />
                      </td>
                    </tr>
                  )
                })}

                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-14 text-center text-zinc-600">
                      Nenhum lead encontrado com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
