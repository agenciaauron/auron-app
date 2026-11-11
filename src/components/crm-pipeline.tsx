'use client'

import { DragEvent, startTransition, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsLeft, ChevronsRight, MessageCircle, Trash2, TriangleAlert } from 'lucide-react'
import { LeadDeleteDialog } from '@/components/lead-delete-dialog'
import { LeadDetails } from '@/components/lead-details'
import {
  RECENT_DAYS,
  formatPhone,
  displayMessage,
  idleDays,
  idleLabel,
  isTemplateMessage,
  leadHeat,
  templateMessages,
  whatsappUrl,
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

type MetaResult = {
  status?: 'sent' | 'already_sent' | 'waiting_value' | 'not_eligible' | 'error'
  event_name?: 'QualifiedLead' | 'Purchase'
  sent_at?: string | null
  error?: string
}

type Props = {
  stages: Stage[]
  leads: Lead[]
  history: HistoryItem[]
}

type DeleteTarget = {
  leadIds: string[]
  title?: string
} | null

function sourceLabel(source: string) {
  const value = source.toLowerCase()
  if (value.includes('anúncio') || value.includes('anuncio')) return 'Anúncio'
  if (value.includes('landing') || value.includes('site')) return 'Site'
  return source
}

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function CrmPipeline({ stages, leads, history }: Props) {
  const router = useRouter()
  const [localLeads, setLocalLeads] = useState(leads)
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  // A coluna de perdidos começa recolhida: é a que mais acumula.
  const [lostOpen, setLostOpen] = useState(false)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  // Dados novos do servidor (após router.refresh) substituem a cópia local.
  const [prevLeads, setPrevLeads] = useState(leads)
  if (leads !== prevLeads) {
    setPrevLeads(leads)
    setLocalLeads(leads)
  }

  const templates = useMemo(() => templateMessages(leads), [leads])
  const entryStageId = stages.find((stage) => !stage.is_won && !stage.is_lost)?.id
  const openLead = localLeads.find((lead) => lead.id === openLeadId)

  function toggleOlder(stageId: string) {
    setExpandedStages((current) => {
      const next = new Set(current)
      if (next.has(stageId)) next.delete(stageId)
      else next.add(stageId)
      return next
    })
  }

  function handleDeleteDone(count: number) {
    if (!deleteTarget) return
    const ids = new Set(deleteTarget.leadIds)

    setLocalLeads((current) => current.filter((lead) => !ids.has(lead.id)))
    setDeleteTarget(null)
    startTransition(() => {
      router.refresh()
    })

    if (count === 0) {
      alert('Nenhum lead foi alterado.')
    }
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, leadId: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', leadId)
    setDraggingLeadId(leadId)
  }

  function handleDragEnd() {
    setDraggingLeadId(null)
    setOverStageId(null)
  }

  function applyMetaResult(leadId: string, meta: MetaResult | null | undefined) {
    if (!meta) return

    setLocalLeads((current) =>
      current.map((item) => {
        if (item.id !== leadId) return item

        if (meta.status === 'sent' || meta.status === 'already_sent') {
          if (meta.event_name === 'QualifiedLead') {
            return {
              ...item,
              meta_qualified_sent_at: meta.sent_at ?? item.meta_qualified_sent_at,
              meta_last_error: null,
              meta_last_error_at: null,
            }
          }

          if (meta.event_name === 'Purchase') {
            return {
              ...item,
              meta_purchase_sent_at: meta.sent_at ?? item.meta_purchase_sent_at,
              meta_last_error: null,
              meta_last_error_at: null,
            }
          }
        }

        if (meta.status === 'error') {
          return {
            ...item,
            meta_last_error: meta.error || 'Falha ao enviar evento à Meta.',
            meta_last_error_at: new Date().toISOString(),
          }
        }

        return item
      })
    )
  }

  async function moveLead(leadId: string, stageId: string) {
    const lead = localLeads.find((item) => item.id === leadId)

    if (!lead || lead.stage_id === stageId || savingLeadId === leadId) {
      setDraggingLeadId(null)
      setOverStageId(null)
      return
    }

    const previousStageId = lead.stage_id

    setLocalLeads((current) =>
      current.map((item) =>
        item.id === leadId ? { ...item, stage_id: stageId } : item
      )
    )
    setSavingLeadId(leadId)
    setDraggingLeadId(null)
    setOverStageId(null)

    try {
      const response = await fetch('/api/leads/stage', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId, stageId }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível mover o lead.')
      }

      applyMetaResult(leadId, result.meta)

      startTransition(() => {
        router.refresh()
      })

      if (result.meta?.status === 'waiting_value') {
        alert('Lead movido para Venda. Abra a ficha e informe o valor da venda para enviar Purchase à Meta.')
      }

      if (result.meta?.status === 'error') {
        alert(`Lead movido, mas a Meta não confirmou o evento: ${result.meta.error || 'erro desconhecido'}`)
      }
    } catch {
      setLocalLeads((current) =>
        current.map((item) =>
          item.id === leadId ? { ...item, stage_id: previousStageId } : item
        )
      )
      alert('Não foi possível mover o lead. Tente novamente.')
    } finally {
      setSavingLeadId(null)
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault()
    const leadId = event.dataTransfer.getData('text/plain') || draggingLeadId

    if (leadId) {
      void moveLead(leadId, stageId)
    }
  }

  function dropHandlers(stageId: string) {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOverStageId(stageId)
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOverStageId(null)
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => handleDrop(event, stageId),
    }
  }

  return (
    <>
      <div className="pipeline-scrollbar flex gap-3 overflow-x-auto pb-3">
        {stages.map((stage) => {
          const stageLeads = localLeads.filter((lead) => lead.stage_id === stage.id)
          const isDropTarget = overStageId === stage.id && draggingLeadId !== null
          const dot = stage.is_won ? 'bg-emerald-400' : stage.is_lost ? 'bg-rose-400' : 'bg-auron-400'

          // Coluna de perdidos recolhida: só o nome e o total (ainda recebe leads arrastados).
          if (stage.is_lost && !lostOpen) {
            return (
              <section
                key={stage.id}
                {...dropHandlers(stage.id)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-4 transition-colors ${
                  isDropTarget ? 'border-rose-400/60 bg-rose-500/[0.06]' : 'border-ink-800/70 bg-ink-950/70'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setLostOpen(true)}
                  title={`Mostrar ${stage.name}`}
                  className="flex flex-1 flex-col items-center gap-3 text-ink-400 transition hover:text-ink-100"
                >
                  <ChevronsLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <span className="text-xs font-semibold tabular text-ink-500">{stageLeads.length}</span>
                  <span className="font-display text-[13px] font-semibold tracking-tight [writing-mode:vertical-rl]">
                    {stage.name}
                  </span>
                </button>
              </section>
            )
          }

          // Novo lead e perdidos acumulam: mostra só os recentes e recolhe o resto.
          const collapsible = stage.is_lost || stage.id === entryStageId
          const recentLeads = collapsible
            ? stageLeads.filter((lead) => idleDays(lead, now) < RECENT_DAYS)
            : stageLeads
          const olderLeads = collapsible
            ? stageLeads.filter((lead) => idleDays(lead, now) >= RECENT_DAYS)
            : []
          const showOlder = expandedStages.has(stage.id)
          const shownLeads = showOlder ? [...recentLeads, ...olderLeads] : recentLeads

          return (
            <section
              key={stage.id}
              {...dropHandlers(stage.id)}
              className={`flex min-h-[320px] min-w-[240px] flex-1 flex-col rounded-2xl border p-2.5 transition-colors ${
                isDropTarget ? 'border-auron-500/60 bg-auron-500/[0.06]' : 'border-ink-800/70 bg-ink-950/70'
              }`}
            >
              <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <h3 className="font-display text-[13px] font-semibold tracking-tight text-ink-100">
                    {stage.name}
                  </h3>
                  <span className="rounded-full bg-ink-800/80 px-2 py-0.5 text-[11px] font-semibold tabular text-ink-400">
                    {stageLeads.length}
                  </span>
                </div>

                {stage.is_lost && (
                  <button
                    type="button"
                    onClick={() => setLostOpen(false)}
                    title="Recolher coluna"
                    className="rounded-md p-1 text-ink-500 transition hover:bg-ink-800 hover:text-ink-200"
                  >
                    <ChevronsRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2">
                {shownLeads.length === 0 && (
                  <div
                    className={`rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors ${
                      isDropTarget ? 'border-auron-500/50 text-auron-300' : 'border-ink-800 text-ink-600'
                    }`}
                  >
                    {isDropTarget
                      ? 'Solte o lead aqui'
                      : olderLeads.length > 0
                        ? `Nada nos últimos ${RECENT_DAYS} dias`
                        : 'Nenhum lead'}
                  </div>
                )}

                {shownLeads.map((lead) => {
                  const isDragging = draggingLeadId === lead.id
                  const isSaving = savingLeadId === lead.id
                  const days = idleDays(lead, now)
                  const heat = stage.is_won || stage.is_lost ? 'cold' : leadHeat(days)
                  const waUrl = whatsappUrl(lead.phone)
                  const showMessage = !isTemplateMessage(lead.last_message, templates)

                  return (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      draggable={!isSaving}
                      onDragStart={(event) => handleDragStart(event, lead.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setOpenLeadId(lead.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setOpenLeadId(lead.id)
                      }}
                      className={`group relative cursor-pointer rounded-xl border border-ink-800/80 bg-ink-900 py-2.5 pl-3.5 pr-3 transition active:cursor-grabbing ${
                        isDragging ? 'opacity-40' : 'hover:border-ink-700 hover:bg-[#1b182c]'
                      } ${isSaving ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <span className="lead-heat" data-heat={heat} aria-hidden />

                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[14px] font-semibold text-ink-50">{lead.name}</p>
                        <span
                          className={`shrink-0 text-[11px] tabular ${
                            heat === 'cool' ? 'text-amber-300/80' : 'text-ink-500'
                          }`}
                          title="Última atividade do lead"
                        >
                          {isSaving ? 'Salvando…' : idleLabel(days)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                        {lead.phone && <span className="font-mono">{formatPhone(lead.phone)}</span>}
                        {lead.source && (
                          <span className="rounded bg-ink-800 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                            {sourceLabel(lead.source)}
                          </span>
                        )}
                        {lead.meta_last_error && (
                          <span title="Meta: erro no último envio" className="text-rose-400">
                            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          </span>
                        )}
                      </div>

                      {showMessage && lead.last_message && (
                        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-ink-300">{displayMessage(lead.last_message)}</p>
                      )}

                      {stage.is_lost && lead.lost_reason && (
                        <p className="mt-2 inline-flex rounded-md bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                          {lead.lost_reason}
                        </p>
                      )}

                      {stage.is_won && lead.sale_value != null && (
                        <p className="mt-1.5 font-display text-base font-semibold tabular text-emerald-300">
                          {formatCurrency(lead.sale_value)}
                        </p>
                      )}

                      {/* Ações aparecem só ao passar o mouse */}
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-lg bg-ink-900/95 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            title="Abrir conversa no WhatsApp"
                            aria-label={`Abrir conversa com ${lead.name} no WhatsApp`}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-whatsapp/15 hover:text-whatsapp"
                          >
                            <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </a>
                        )}

                        {!stage.is_won && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setDeleteTarget({ leadIds: [lead.id], title: `Excluir ${lead.name}?` })
                            }}
                            title="Excluir lead"
                            aria-label={`Excluir ${lead.name}`}
                            className="rounded-md p-1.5 text-ink-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {olderLeads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleOlder(stage.id)}
                    className="w-full rounded-lg px-3 py-2 text-xs text-ink-500 transition hover:bg-ink-900 hover:text-ink-200"
                  >
                    {showOlder
                      ? 'Recolher leads antigos'
                      : `+ ${olderLeads.length} ${olderLeads.length === 1 ? 'lead antigo' : 'leads antigos'}`}
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

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

      {deleteTarget && (
        <LeadDeleteDialog
          {...deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={handleDeleteDone}
        />
      )}
    </>
  )
}
