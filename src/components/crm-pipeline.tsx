'use client'

import { DragEvent, startTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LeadDeleteDialog } from '@/components/lead-delete-dialog'
import { LeadDetails } from '@/components/lead-details'
import { LeadStageSelect } from '@/components/lead-stage-select'
import { IDLE_DAYS_DEFAULT, RECENT_DAYS, idleDays, idleLabel } from '@/lib/lead-cleanup'

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
  const [now] = useState(() => Date.now())

  useEffect(() => {
    setLocalLeads(leads)
  }, [leads])

  const entryStageId = stages.find((stage) => !stage.is_won && !stage.is_lost)?.id

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

  return (
    <>
    <div className="pipeline-scrollbar flex gap-3 overflow-x-auto pb-3">
      {stages.map((stage) => {
        const stageLeads = localLeads.filter(
          (lead) => lead.stage_id === stage.id
        )
        const isDropTarget = overStageId === stage.id && draggingLeadId !== null

        // Novo lead e Desqualificado acumulam: mostra só os recentes e recolhe o resto.
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
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setOverStageId(stage.id)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOverStageId(null)
              }
            }}
            onDrop={(event) => handleDrop(event, stage.id)}
            className={`min-h-[310px] min-w-[280px] max-w-[280px] rounded-2xl border p-4 transition-colors ${
              isDropTarget
                ? 'border-purple-500/70 bg-purple-500/5'
                : 'border-zinc-800 bg-zinc-900/55'
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    stage.is_won
                      ? 'bg-emerald-500'
                      : stage.is_lost
                        ? 'bg-red-500'
                        : 'bg-purple-500'
                  }`}
                />
                <h3 className="text-sm font-semibold text-zinc-200">
                  {stage.name}
                </h3>
              </div>

              <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                {stageLeads.length}
              </span>
            </div>

            <div className="space-y-3">
              {shownLeads.length === 0 && (
                <div
                  className={`rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors ${
                    isDropTarget
                      ? 'border-purple-500/50 text-purple-300'
                      : 'border-zinc-800 text-zinc-600'
                  }`}
                >
                  {isDropTarget
                    ? 'Solte o lead aqui'
                    : olderLeads.length > 0
                      ? `Nenhum lead nos últimos ${RECENT_DAYS} dias`
                      : 'Nenhum lead'}
                </div>
              )}

              {shownLeads.map((lead) => {
                const leadHistory = history.filter(
                  (item) => item.lead_id === lead.id
                )
                const isDragging = draggingLeadId === lead.id
                const isSaving = savingLeadId === lead.id
                const hasMetaSuccess = Boolean(
                  lead.meta_qualified_sent_at || lead.meta_purchase_sent_at
                )
                const days = idleDays(lead, now)

                return (
                  <div
                    key={lead.id}
                    draggable={!isSaving}
                    onDragStart={(event) => handleDragStart(event, lead.id)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 shadow-sm transition active:cursor-grabbing ${
                      isDragging ? 'opacity-40' : 'opacity-100 hover:border-zinc-700'
                    } ${isSaving ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <div className="mb-3 flex items-center justify-between text-[11px] text-zinc-600">
                      <span className={days >= IDLE_DAYS_DEFAULT && !stage.is_won && !stage.is_lost ? 'text-amber-400/80' : ''}>
                        Última atividade {idleLabel(days)}
                      </span>
                      {isSaving && <span className="text-purple-400">Salvando...</span>}
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-100">
                          {lead.name}
                        </p>
                        {lead.phone && (
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {lead.phone}
                          </p>
                        )}
                      </div>

                      {lead.source && (
                        <span className="max-w-[100px] truncate rounded-md bg-purple-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-purple-300">
                          {lead.source}
                        </span>
                      )}
                    </div>

                    {lead.last_message && (
                      <p className="mt-3 line-clamp-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-5 text-zinc-400">
                        “{lead.last_message}”
                      </p>
                    )}

                    {stage.is_lost && lead.lost_reason && (
                      <p className="mt-3 text-xs text-red-300/80">
                        Motivo: {lead.lost_reason}
                      </p>
                    )}

                    {lead.ctwa_clid && (
                      <div className="mt-3 flex items-center gap-2 text-[11px]">
                        {lead.meta_last_error ? (
                          <span className="text-red-400">Meta: erro no último envio</span>
                        ) : hasMetaSuccess ? (
                          <span className="text-emerald-400">Meta: evento enviado</span>
                        ) : (
                          <span className="text-zinc-600">Meta: anúncio vinculado</span>
                        )}
                      </div>
                    )}

                    {(lead.campaign || (stage.is_won && lead.sale_value != null)) && (
                      <div className="mt-4 border-t border-zinc-800/80 pt-3">
                        {lead.campaign && (
                          <p className="truncate text-xs text-zinc-600">
                            {lead.campaign}
                          </p>
                        )}

                        {stage.is_won && lead.sale_value != null && (
                          <p className="mt-1 text-sm font-medium text-emerald-300">
                            Venda: {formatCurrency(lead.sale_value)}
                          </p>
                        )}
                      </div>
                    )}

                    <LeadStageSelect
                      leadId={lead.id}
                      currentStageId={lead.stage_id}
                      stages={stages}
                    />

                    <div className={stage.is_won ? '' : 'grid grid-cols-2 gap-2'}>
                      <LeadDetails
                        lead={lead}
                        stages={stages}
                        history={leadHistory}
                      />

                      {!stage.is_won && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ leadIds: [lead.id], title: `Excluir ${lead.name}?` })
                          }
                          className="mt-3 w-full rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-500 transition hover:border-red-500/40 hover:text-red-300"
                        >
                          Excluir
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
                  className="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                >
                  {showOlder
                    ? 'Recolher leads antigos'
                    : `Ver ${olderLeads.length} ${olderLeads.length === 1 ? 'lead antigo' : 'leads antigos'} (+${RECENT_DAYS} dias)`}
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>

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
