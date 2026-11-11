'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StageChangeDialog, stageNeedsInput, type StageExtras } from '@/components/stage-change-dialog'
import { fromLocalInput } from '@/lib/crm'
import type { Stage } from '@/lib/lead-types'

type Props = {
  leadId: string
  leadName: string
  currentStageId: string | null
  stages: Stage[]
}

export function SdrStageSelect({
  leadId,
  leadName,
  currentStageId,
  stages,
}: Props) {
  const router = useRouter()

  const [stageId, setStageId] = useState(currentStageId ?? '')
  const [loading, setLoading] = useState(false)
  const [pendingStage, setPendingStage] = useState<Stage | null>(null)

  function requestChange(newStageId: string) {
    const stage = stages.find((item) => item.id === newStageId)
    if (stageNeedsInput(stage)) {
      setPendingStage(stage!)
      return
    }
    void changeStage(newStageId)
  }

  async function changeStage(newStageId: string, extras?: StageExtras) {
    setStageId(newStageId)
    setLoading(true)

    const response = await fetch('/api/leads/stage', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leadId,
        stageId: newStageId,
        strict: true,
        lostReason: extras?.lostReason,
        meetingAt: extras?.meetingAt ? fromLocalInput(extras.meetingAt) : undefined,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setStageId(currentStageId ?? '')
      alert(result.error || 'Não foi possível alterar a etapa.')
      setLoading(false)
      return
    }

    if (result.meta?.status === 'error') {
      alert(`Etapa alterada, mas a Meta não confirmou o evento: ${result.meta.error || 'erro desconhecido'}`)
    }

    if (result.meta?.status === 'waiting_value') {
      alert('Etapa alterada. Abra a ficha do lead e informe o valor da venda para enviar Purchase à Meta.')
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <select
        value={stageId}
        disabled={loading}
        onChange={(event) => requestChange(event.target.value)}
        className="mt-3 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
      >
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>

      {pendingStage && (
        <StageChangeDialog
          stage={pendingStage}
          leadName={leadName}
          onCancel={() => setPendingStage(null)}
          onConfirm={(extras) => {
            const stage = pendingStage
            setPendingStage(null)
            void changeStage(stage.id, extras)
          }}
        />
      )}
    </>
  )
}
