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
  estimated_value: number | string | null
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

function formatCurrency(value: number | string | null) {
  return Number(value ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function LeadsWorkspace({ stages, leads, history }: Props) {
  const [view, setView] = useState<View>('funnel')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

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

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase()

    return [...leads]
      .filter((lead) => {
        if (stageFilter !== 'all' && lead.stage_id !== stageFilter) return false
        if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false

        if (!term) return true

        return [lead.name, lead.phone, lead.email, lead.source, lead.campaign]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
  }, [leads, search, sourceFilter, stageFilter])

  function stageName(stageId: string | null) {
    return stages.find((stage) => stage.id === stageId)?.name ?? 'Sem etapa'
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nome, telefone ou e-mail"
              className="min-w-[260px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />

            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 outline-none"
            >
              <option value="all">Todas as etapas</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 outline-none"
            >
              <option value="all">Todas as origens</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {view === 'funnel' ? (
        <CrmPipeline stages={stages} leads={leads} history={history} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/45">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-5 py-4 font-medium">Lead</th>
                <th className="px-5 py-4 font-medium">Origem</th>
                <th className="px-5 py-4 font-medium">Campanha</th>
                <th className="px-5 py-4 font-medium">Entrada</th>
                <th className="px-5 py-4 font-medium">Valor</th>
                <th className="px-5 py-4 font-medium">Etapa</th>
                <th className="px-5 py-4 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {filteredLeads.map((lead) => {
                const leadHistory = history.filter((item) => item.lead_id === lead.id)

                return (
                  <tr key={lead.id} className="hover:bg-zinc-900/80">
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-200">{lead.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {lead.phone || lead.email || 'Sem contato informado'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-zinc-400">
                      {lead.source || '—'}
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-4 text-zinc-500">
                      {lead.campaign || '—'}
                    </td>
                    <td className="px-5 py-4 text-zinc-500">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-5 py-4 font-medium text-zinc-300">
                      {formatCurrency(lead.estimated_value)}
                    </td>
                    <td className="w-[210px] px-5 py-4">
                      <p className="mb-2 text-xs text-zinc-600">{stageName(lead.stage_id)}</p>
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
                  <td colSpan={7} className="px-5 py-14 text-center text-zinc-600">
                    Nenhum lead encontrado com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
