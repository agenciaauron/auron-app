'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Stage = {
  id: string
  name: string
}

type Props = {
  leadId: string
  currentStageId: string | null
  stages: Stage[]
}

export function LeadStageSelect({
  leadId,
  currentStageId,
  stages,
}: Props) {
  const router = useRouter()

  const [stageId, setStageId] = useState(currentStageId ?? '')
  const [loading, setLoading] = useState(false)

  async function changeStage(newStageId: string) {
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
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setStageId(currentStageId ?? '')
      alert('Não foi possível alterar a etapa.')
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
    <select
      value={stageId}
      disabled={loading}
      onChange={(event) => changeStage(event.target.value)}
      className="mt-3 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
    >
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.name}
        </option>
      ))}
    </select>
  )
}
