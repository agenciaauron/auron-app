'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

type Stage = {
  id: string
  name: string
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
  estimated_value: number | string | null
  sale_value: number | string | null
}

type Props = {
  lead: Lead
  stages: Stage[]
}

export function LeadDetails({ lead, stages }: Props) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setError('')

    const form = new FormData(event.currentTarget)

    const response = await fetch('/api/leads/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leadId: lead.id,
        name: form.get('name'),
        phone: form.get('phone'),
        email: form.get('email'),
        source: form.get('source'),
        campaign: form.get('campaign'),
        notes: form.get('notes'),
        estimatedValue: form.get('estimatedValue'),
        saleValue: form.get('saleValue'),
        stageId: form.get('stageId'),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Não foi possível atualizar o lead.')
      setLoading(false)
      return
    }

    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
      >
        Ver ficha
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-purple-400">
              Ficha do lead
            </p>

            <h2 className="mt-1 text-2xl font-semibold">
              {lead.name}
            </h2>
          </div>

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
            defaultValue={lead.name}
            placeholder="Nome"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <input
            name="phone"
            defaultValue={lead.phone ?? ''}
            placeholder="Telefone"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <input
            name="email"
            type="email"
            defaultValue={lead.email ?? ''}
            placeholder="E-mail"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <input
            name="source"
            defaultValue={lead.source ?? ''}
            placeholder="Origem"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <input
            name="campaign"
            defaultValue={lead.campaign ?? ''}
            placeholder="Campanha"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <select
            name="stageId"
            defaultValue={lead.stage_id ?? ''}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>

          <input
            name="estimatedValue"
            type="number"
            step="0.01"
            defaultValue={lead.estimated_value ?? ''}
            placeholder="Valor estimado"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <input
            name="saleValue"
            type="number"
            step="0.01"
            defaultValue={lead.sale_value ?? ''}
            placeholder="Valor da venda"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
          />

          <textarea
            name="notes"
            rows={5}
            defaultValue={lead.notes ?? ''}
            placeholder="Observações sobre o lead"
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3"
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
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>
    </div>
  )
}
