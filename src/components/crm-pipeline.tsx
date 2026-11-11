'use client'

import { DragEvent, startTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LeadDeleteDialog } from '@/components/lead-delete-dialog'
import { LeadDetails } from '@/components/lead-details'
import { StageChangeDialog, stageNeedsInput, type StageExtras } from '@/components/stage-change-dialog'
import { AlarmClock, CalendarCheck, CheckCheck, Megaphone, MessageCircle, Trash2, TriangleAlert } from 'lucide-react'
import {
  RECENT_DAYS,
  formatPhone,
  idleDays,
  idleLabel,
  leadHeat,
  whatsappUrl,
} from '@/lib/lead-cleanup'
import { dueLabel, dueState, formatDateTime, fromLocalInput, isManager, type TeamMember } from '@/lib/crm'
import type { Activity, HistoryItem, Lead, Stage } from '@/lib/lead-types'

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
  activities: Activity[]
  team: TeamMember[]
  role: string
}

type PendingMove = {
  leadId: string
  leadName: string
  stage: Stage
} | null

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

export function CrmPipeline({ stages, leads, history, activities, team, role }: Props) {
  const router = useRouter()
  const manager = isManager(role)
  const [pendingMove, setPendingMove] = useState<PendingMove>(null)
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

  async function moveLead(leadId: string, stageId: string, extras?: StageExtras) {
    const lead = localLeads.find((item) => item.id === leadId)

    if (!lead || lead.stage_id === stageId || savingLeadId === leadId) {
      setDraggingLeadId(null)
      setOverStageId(null)
      return
    }

    // Perda pede o motivo e Reunião pede a data antes de mover.
    const targetStage = stages.find((stage) => stage.id === stageId)
    if (!extras && stageNeedsInput(targetStage)) {
      setDraggingLeadId(null)
      setOverStageId(null)
      setPendingMove({ leadId, leadName: lead.name, stage: targetStage! })
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
        body: JSON.stringify({
          leadId,
          stageId,
          lostReason: extras?.lostReason,
          // Converte no navegador: o servidor roda em UTC e erraria o fuso.
          meetingAt: extras?.meetingAt ? fromLocalInput(extras.meetingAt) : undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível mover o lead.')
      }

      if (extras?.lostReason || extras?.meetingAt) {
        setLocalLeads((current) =>
          current.map((item) =>
            item.id === leadId
              ? {
                  ...item,
                  ...(extras.lostReason ? { lost_reason: extras.lostReason } : {}),
                  ...(extras.meetingAt
                    ? { meeting_at: new Date(extras.meetingAt).toISOString(), meeting_status: 'agendada' }
                    : {}),
                }
              : item
          )
        )
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
    } catch (error) {
      setLocalLeads((current) =>
        current.map((item) =>
          item.id === leadId ? { ...item, stage_id: previousStageId } : item
        )
      )
      alert(error instanceof Error && error.message ? error.message : 'Não foi possível mover o lead. Tente novamente.')
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
            className={`flex min-h-[320px] w-[296px] shrink-0 flex-col rounded-2xl border p-3 transition-colors ${
              isDropTarget
                ? 'border-auron-500/60 bg-auron-500/[0.06]'
                : 'border-ink-800/70 bg-ink-950/70'
            }`}
          >
            <div className="mb-3 flex items-center justify-between px-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    stage.is_won
                      ? 'bg-emerald-400'
                      : stage.is_lost
                        ? 'bg-rose-400'
                        : 'bg-auron-400'
                  }`}
                />
                <h3 className="font-display text-[13px] font-semibold tracking-tight text-ink-100">
                  {stage.name}
                </h3>
              </div>

              <span className="tabular text-xs font-semibold text-ink-500">
                {collapsible && olderLeads.length > 0
                  ? `${recentLeads.length} de ${stageLeads.length}`
                  : stageLeads.length}
              </span>
            </div>

            <div className="flex-1 space-y-2">
              {shownLeads.length === 0 && (
                <div
                  className={`rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors ${
                    isDropTarget
                      ? 'border-auron-500/50 text-auron-300'
                      : 'border-ink-800 text-ink-600'
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
                const heat = stage.is_won || stage.is_lost ? 'cold' : leadHeat(days)
                const waUrl = whatsappUrl(lead.phone)

                return (
                  <div
                    key={lead.id}
                    draggable={!isSaving}
                    onDragStart={(event) => handleDragStart(event, lead.id)}
                    onDragEnd={handleDragEnd}
                    className={`group relative cursor-grab rounded-xl border border-ink-800/80 bg-ink-900 py-3 pl-4 pr-3 transition active:cursor-grabbing ${
                      isDragging ? 'opacity-40' : 'hover:border-ink-700 hover:bg-[#1b182c]'
                    } ${isSaving ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <span className="lead-heat" data-heat={heat} aria-hidden />

                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[15px] font-semibold text-ink-50">
                        {lead.name}
                      </p>
                      <span
                        className={`shrink-0 text-[11px] tabular ${
                          heat === 'cool' ? 'text-amber-300/80' : 'text-ink-500'
                        }`}
                        title="Última atividade do lead"
                      >
                        {isSaving ? 'Salvando…' : idleLabel(days)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                      {lead.phone && <span className="font-mono">{formatPhone(lead.phone)}</span>}
                      {lead.source && (
                        <span className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-300">
                          {sourceLabel(lead.source)}
                        </span>
                      )}
                    </div>

                    {lead.last_message && (
                      <p className="mt-2.5 line-clamp-2 text-[13px] leading-5 text-ink-300">
                        {lead.last_message}
                      </p>
                    )}

                    {lead.campaign && (
                      <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-ink-500">
                        <Megaphone className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="truncate">{lead.campaign}</span>
                      </p>
                    )}

                    {stage.is_lost && lead.lost_reason && (
                      <p className="mt-2 inline-flex rounded-md bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                        {lead.lost_reason}
                      </p>
                    )}

                    {stage.is_won && lead.sale_value != null && (
                      <p className="mt-2 font-display text-lg font-semibold tabular text-emerald-300">
                        {formatCurrency(lead.sale_value)}
                      </p>
                    )}

                    {!stage.is_won && !stage.is_lost && lead.meeting_at && lead.meeting_status === 'agendada' && (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-auron-300">
                        <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Reunião {formatDateTime(lead.meeting_at)}
                      </p>
                    )}

                    {!stage.is_won && !stage.is_lost && lead.next_action_at && (
                      <p
                        className={`mt-2 flex items-center gap-1.5 text-[12px] font-medium ${
                          dueState(lead.next_action_at, now) === 'overdue'
                            ? 'text-rose-300'
                            : dueState(lead.next_action_at, now) === 'today'
                              ? 'text-amber-300'
                              : 'text-ink-400'
                        }`}
                        title={lead.next_action_note ?? 'Próximo contato'}
                      >
                        <AlarmClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="truncate">
                          {dueLabel(lead.next_action_at, now)}
                          {lead.next_action_note && ` · ${lead.next_action_note}`}
                        </span>
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-1 border-t border-ink-800/70 pt-2.5">
                      <LeadDetails
                        lead={lead}
                        stages={stages}
                        history={leadHistory}
                        activities={activities.filter((item) => item.lead_id === lead.id)}
                        team={team}
                        role={role}
                        triggerLabel="Abrir ficha"
                        triggerClassName="mr-auto rounded-md px-1.5 py-1 text-[13px] font-semibold text-ink-300 transition hover:bg-ink-800 hover:text-ink-50"
                      />

                      {(lead.ctwa_clid || lead.meta_qualified_sent_at || lead.meta_last_error) &&
                        (lead.meta_last_error ? (
                          <span title="Meta: erro no último envio" className="p-1.5 text-rose-400">
                            <TriangleAlert className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </span>
                        ) : hasMetaSuccess ? (
                          <span title="Meta: evento enviado" className="p-1.5 text-emerald-400">
                            <CheckCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </span>
                        ) : null)}

                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir conversa no WhatsApp"
                          aria-label={`Abrir conversa com ${lead.name} no WhatsApp`}
                          className="rounded-md p-1.5 text-ink-400 transition hover:bg-whatsapp/15 hover:text-whatsapp"
                        >
                          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </a>
                      )}

                      {manager && !stage.is_won && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ leadIds: [lead.id], title: `Excluir ${lead.name}?` })
                          }
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
                  className="w-full rounded-lg border border-dashed border-ink-700 px-3 py-2.5 text-sm text-ink-400 transition hover:border-ink-500 hover:text-ink-200"
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

    {pendingMove && (
      <StageChangeDialog
        stage={pendingMove.stage}
        leadName={pendingMove.leadName}
        onCancel={() => setPendingMove(null)}
        onConfirm={(extras) => {
          const move = pendingMove
          setPendingMove(null)
          void moveLead(move.leadId, move.stage.id, extras)
        }}
      />
    )}
    </>
  )
}
