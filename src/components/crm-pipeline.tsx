'use client'

import { DragEvent, useEffect, useState } from 'react'
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

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function CrmPipeline({ stages, leads, history }: Props) {
  const [localLeads, setLocalLeads] = useState(leads)
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)

  useEffect(() => {
    setLocalLeads(leads)
  }, [leads])

  function handleDragStart(event: DragEvent<HTMLDivElement>, leadId: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', leadId)
    setDraggingLeadId(leadId)
  }

  function handleDragEnd() {
    setDraggingLeadId(null)
    setOverStageId(null)
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

      if (!response.ok) {
        throw new Error('Não foi possível mover o lead.')
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
    <div className="pipeline-scrollbar flex gap-3 overflow-x-auto pb-3">
      {stages.map((stage) => {
        const stageLeads = localLeads.filter(
          (lead) => lead.stage_id === stage.id
        )
        const isDropTarget = overStageId === stage.id && draggingLeadId !== null

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
              {stageLeads.length === 0 && (
                <div
                  className={`rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors ${
                    isDropTarget
                      ? 'border-purple-500/50 text-purple-300'
                      : 'border-zinc-800 text-zinc-600'
                  }`}
                >
                  {isDropTarget ? 'Solte o lead aqui' : 'Nenhum lead'}
                </div>
              )}

              {stageLeads.map((lead) => {
                const leadHistory = history.filter(
                  (item) => item.lead_id === lead.id
                )
                const isDragging = draggingLeadId === lead.id
                const isSaving = savingLeadId === lead.id

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
                    <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-600">
                      <span>Arraste para mover</span>
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

                    <LeadDetails
                      lead={lead}
                      stages={stages}
                      history={leadHistory}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
