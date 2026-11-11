'use client'

import { ReactNode, startTransition, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { CrmPipeline } from '@/components/crm-pipeline'
import { LeadDeleteDialog } from '@/components/lead-delete-dialog'
import { LeadDetails } from '@/components/lead-details'
import {
  displayMessage,
  formatPhone,
  idleDays,
  idleLabel,
  isTemplateMessage,
  templateMessages,
} from '@/lib/lead-cleanup'

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
  last_message: string | null
  last_message_at: string | null
  lost_reason: string | null
  integration_source: string | null
  ctwa_clid: string | null
  meta_qualified_sent_at: string | null
  meta_purchase_sent_at: string | null
  meta_last_error: string | null
  meta_last_error_at: string | null
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

const selectClass =
  'h-9 rounded-lg border border-ink-800 bg-ink-900 px-2.5 text-sm text-ink-300 outline-none transition focus:border-auron-500'

function formatCurrency(value: number | string | null) {
  if (value == null) return '—'

  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${selectClass} ${className}`}
    >
      {children}
    </select>
  )
}

export function LeadsWorkspace({ stages, leads, history }: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>('funnel')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('active')
  const [idleFilter, setIdleFilter] = useState('any')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const [sourceFilter, setSourceFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const templates = useMemo(() => templateMessages(leads), [leads])
  const openLead = leads.find((lead) => lead.id === openLeadId)

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

    const lostStageIds = new Set(
      stages.filter((stage) => stage.is_lost).map((stage) => stage.id)
    )

    const filtered = leads.filter((lead) => {
      if (stageFilter === 'active') {
        if (lead.stage_id && lostStageIds.has(lead.stage_id)) return false
      } else if (stageFilter !== 'all' && lead.stage_id !== stageFilter) {
        return false
      }
      if (idleFilter !== 'any' && idleDays(lead, now) < Number(idleFilter)) return false
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
    stages,
    search,
    stageFilter,
    idleFilter,
    now,
    sourceFilter,
    campaignFilter,
    sortOrder,
  ])

  const filtersActive =
    Boolean(search.trim()) ||
    stageFilter !== 'active' ||
    idleFilter !== 'any' ||
    sourceFilter !== 'all' ||
    campaignFilter !== 'all'

  const visibleSelected = filteredLeads.filter((lead) => selected.has(lead.id))
  const allVisibleSelected =
    filteredLeads.length > 0 && visibleSelected.length === filteredLeads.length

  function toggleLead(leadId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected(
      allVisibleSelected ? new Set() : new Set(filteredLeads.map((lead) => lead.id))
    )
  }

  function handleBulkDone() {
    setConfirmDelete(false)
    setSelected(new Set())
    startTransition(() => {
      router.refresh()
    })
  }

  function stageBadge(stageId: string | null) {
    const stage = stages.find((item) => item.id === stageId)

    const style = stage?.is_won
      ? 'bg-emerald-500/10 text-emerald-300'
      : stage?.is_lost
        ? 'bg-rose-500/10 text-rose-300'
        : 'bg-auron-500/12 text-auron-200'

    return (
      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
        {stage?.name ?? 'Sem etapa'}
      </span>
    )
  }

  function clearFilters() {
    setSearch('')
    setStageFilter('active')
    setIdleFilter('any')
    setSourceFilter('all')
    setCampaignFilter('all')
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-ink-800 bg-ink-900 p-1">
          {(['funnel', 'list'] as View[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${
                view === item ? 'bg-auron-600 font-medium text-white' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {item === 'funnel' ? 'Funil' : 'Lista'}
            </button>
          ))}
        </div>

        {view === 'list' && (
          <p className="text-sm text-ink-500">
            <span className="font-medium text-ink-200">{filteredLeads.length}</span>{' '}
            {filteredLeads.length === 1 ? 'lead' : 'leads'}
            {filteredLeads.length !== leads.length && ` de ${leads.length}`}
          </p>
        )}

        {view === 'list' && filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-auron-400 transition hover:text-auron-300"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {view === 'funnel' ? (
        <CrmPipeline stages={stages} leads={leads} history={history} />
      ) : (
        <>
          {/* Filtros numa linha só */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-600"
                strokeWidth={2}
                aria-hidden
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar lead"
                aria-label="Buscar"
                className={`${selectClass} w-full pl-9 placeholder:text-ink-600`}
              />
            </div>

            <FilterSelect label="Etapa" value={stageFilter} onChange={setStageFilter}>
              <option value="active">Etapa: ativas</option>
              <option value="all">Etapa: todas</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Origem" value={sourceFilter} onChange={setSourceFilter}>
              <option value="all">Origem: todas</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Campanha" value={campaignFilter} onChange={setCampaignFilter} className="max-w-[200px]">
              <option value="all">Campanha: todas</option>
              {campaignOptions.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Sem atividade" value={idleFilter} onChange={setIdleFilter}>
              <option value="any">Atividade: qualquer</option>
              <option value="1">Parado há 1+ dia</option>
              <option value="3">Parado há 3+ dias</option>
              <option value="7">Parado há 7+ dias</option>
              <option value="15">Parado há 15+ dias</option>
            </FilterSelect>

            <FilterSelect label="Ordenar" value={sortOrder} onChange={(value) => setSortOrder(value as SortOrder)}>
              <option value="newest">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="name">Nome A–Z</option>
            </FilterSelect>
          </div>

          {visibleSelected.length > 0 && (
            <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-auron-500/30 bg-ink-900 px-4 py-2.5 shadow-lg">
              <span className="text-sm text-ink-200">
                <span className="font-semibold">{visibleSelected.length}</span>{' '}
                {visibleSelected.length === 1 ? 'selecionado' : 'selecionados'}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-400 transition hover:text-ink-200"
                >
                  Limpar seleção
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-500"
                >
                  Excluir
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-ink-800 bg-ink-900/40">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-ink-800 text-[11px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="w-12 py-3 pl-5">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os leads filtrados"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 accent-auron-600"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Etapa</th>
                  <th className="px-4 py-3 font-medium">Origem</th>
                  <th className="px-4 py-3 font-medium">Entrada</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-ink-800/70">
                {filteredLeads.map((lead) => {
                  const currentStage = stages.find((stage) => stage.id === lead.stage_id)
                  const showMessage = !isTemplateMessage(lead.last_message, templates)

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setOpenLeadId(lead.id)}
                      className={`cursor-pointer transition hover:bg-ink-900/80 ${
                        selected.has(lead.id) ? 'bg-auron-500/5' : ''
                      }`}
                    >
                      <td className="py-3 pl-5" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${lead.name}`}
                          checked={selected.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="h-4 w-4 accent-auron-600"
                        />
                      </td>

                      <td className="max-w-[320px] px-4 py-3">
                        <p className="truncate font-medium text-ink-100">{lead.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-ink-500">
                          {lead.phone ? formatPhone(lead.phone) : lead.email || 'Sem contato'}
                        </p>
                        {showMessage && lead.last_message && (
                          <p className="mt-1 truncate text-xs text-ink-500">“{displayMessage(lead.last_message)}”</p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {stageBadge(lead.stage_id)}
                        {currentStage?.is_lost && lead.lost_reason && (
                          <p className="mt-1 text-xs text-ink-500">{lead.lost_reason}</p>
                        )}
                      </td>

                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-ink-300">{lead.source || '—'}</p>
                        {lead.campaign && <p className="mt-0.5 truncate text-xs text-ink-500">{lead.campaign}</p>}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-ink-300">{new Date(lead.created_at).toLocaleDateString('pt-BR')}</p>
                        <p className="mt-0.5 text-xs text-ink-500">Ativo {idleLabel(idleDays(lead, now))}</p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        {currentStage?.is_won && lead.sale_value != null ? (
                          <span className="text-emerald-300">{formatCurrency(lead.sale_value)}</span>
                        ) : (
                          <span className="text-ink-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-ink-500">
                      Nenhum lead encontrado com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openLead && (
        <LeadDetails
          key={openLead.id}
          lead={openLead}
          stages={stages}
          history={history.filter((item) => item.lead_id === openLead.id)}
          open
          onClose={() => setOpenLeadId(null)}
        />
      )}

      {confirmDelete && (
        <LeadDeleteDialog
          leadIds={visibleSelected.map((lead) => lead.id)}
          onClose={() => setConfirmDelete(false)}
          onDone={handleBulkDone}
        />
      )}
    </>
  )
}
