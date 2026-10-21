'use client'

import { useState } from 'react'

type Props = {
  leadIds: string[]
  title?: string
  onClose: () => void
  onDone: (count: number) => void
}

export function LeadDeleteDialog({ leadIds, title, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const count = leadIds.length
  const plural = count === 1 ? 'lead' : 'leads'

  async function confirm() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', leadIds }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível excluir.')
      }

      onDone(result.count ?? count)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.')
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
      <div className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-900 p-6">
        <p className="text-sm text-red-400">Excluir permanentemente</p>
        <h2 className="mt-1 text-xl font-semibold text-ink-100">
          {title ?? `${count} ${plural} selecionado${count === 1 ? '' : 's'}`}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-400">
          {count === 1 ? 'O lead e o histórico dele serão apagados' : 'Os leads e o histórico deles serão apagados'}{' '}
          e não poderão ser recuperados. Se a pessoa mandar mensagem de novo, ela volta como lead novo.
        </p>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-ink-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading || count === 0}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
          >
            {loading ? 'Excluindo...' : `Excluir ${count} ${plural}`}
          </button>
        </div>
      </div>
    </div>
  )
}
