'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export function NewLeadForm() {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setError('')

    const form = new FormData(event.currentTarget)

    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: form.get('name'),
        phone: form.get('phone'),
        email: form.get('email'),
        source: form.get('source'),
        campaign: form.get('campaign'),
        estimatedValue: form.get('estimatedValue'),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Erro ao cadastrar lead.')
      setLoading(false)
      return
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white"
      >
        + Novo lead
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Novo lead
          </h2>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-zinc-400"
          >
            Fechar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            required
            placeholder="Nome do lead"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
          />

          <input
            name="phone"
            placeholder="Telefone"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
          />

          <input
            name="email"
            type="email"
            placeholder="E-mail"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
          />

          <input
            name="source"
            placeholder="Origem, ex: Meta Ads"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
          />

          <input
            name="campaign"
            placeholder="Campanha"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
          />

          <input
            name="estimatedValue"
            type="number"
            step="0.01"
            placeholder="Valor estimado"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
          />

          {error && (
            <p className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium disabled:opacity-60"
          >
            {loading ? 'Salvando...' : 'Cadastrar lead'}
          </button>
        </form>
      </div>
    </div>
  )
}