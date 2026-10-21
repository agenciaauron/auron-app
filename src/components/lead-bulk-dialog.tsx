'use client'

import { useState } from 'react'
import { LOST_REASONS } from '@/lib/lead-cleanup'

type Props = {
  mode: 'disqualify' | 'delete'
  leadIds: string[]
  defaultReason?: string
  title?: string
  description?: string
  onClose: () => void
  onDone: (count: number, reason: string) => void
}

export function LeadBulkDialog({
  mode,
  leadIds,
  defaultReason,
  title,
  description,
  onClose,
  onDone,
}: Props) {
  const [reason, setReason] = useState(defaultReason ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const count = leadIds.length
  const plural = count === 1 ? 'lead' : 'leads'
  const isDelete = mode === 'delete'

  async function confirm() {
    if (!isDelete && !reason) {
      setError('Escolha um motivo.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, leadIds, reason }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível concluir a ação.')
      }

      onDone(result.count ?? count, reason)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.')
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <p className={`text-sm ${isDelete ? 'text-red-400' : 'text-amber-400'}`}>
          {isDelete ? 'Excluir permanentemente' : 'Desqualificar'}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-100">
          {title ?? `${count} ${plural} selecionado${count === 1 ? '' : 's'}`}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {description ??
            (isDelete
              ? 'Os leads e o histórico deles serão apagados e não poderão ser recuperados. Se a pessoa mandar mensagem de novo, ela volta como lead novo.'
              : 'Os leads saem do funil e vão para Perdido com o motivo escolhido. Eles continuam guardados para os relatórios.')}
        </p>

        {!isDelete && (
          <div className="mt-5 flex flex-wrap gap-2">
            {LOST_REASONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setReason(item)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  reason === item
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                    : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading || count === 0}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${
              isDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {loading
              ? 'Processando...'
              : isDelete
                ? `Excluir ${count} ${plural}`
                : `Desqualificar ${count} ${plural}`}
          </button>
        </div>
      </div>
    </div>
  )
}
