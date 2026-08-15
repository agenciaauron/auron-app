'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

type Stage = {
  id: string
  name: string
  is_won?: boolean
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
  event_type: string
  from_stage_id: string | null
  to_stage_id: string | null
  created_at: string
}

type Props = {
  lead: Lead
  stages: Stage[]
  history: HistoryItem[]
}

export function LeadDetails({ lead, stages, history }: Props) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedStageId, setSelectedStageId] = useState(lead.stage_id ?? '')

  const selectedStage = stages.find((stage) => stage.id === selectedStageId)
  const isSaleStage = Boolean(selectedStage?.is_won)

  function getStageName(stageId: string | null) {
    if (!stageId) return 'Etapa não identificada'

    return stages.find((stage) => stage.id === stageId)?.name ?? 'Etapa não identificada'
  }

  function getHistoryText(item: HistoryItem) {
    if (item.event_type === 'created') {
      return 'Lead adicionado ao CRM'
    }

    if (item.event_type === 'stage_changed') {
      return `Movido de ${getStageName(item.from_stage_id)} para ${getStageName(item.to_stage_id)}`
    }

    return 'Atualização registrada'
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  }

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
        saleValue: isSaleStage ? form.get('saleValue') : null,
        stageId: selectedStageId,
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

  function openDetails() {
    setSelectedStageId(lead.stage_id ?? '')
    setError('')
    setOpen(true)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openDetails}
        className="mt-3 w-full rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900"
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
            <p className="text-sm text-purple-400">Ficha do lead</p>
            <h2 className="mt-1 text-2xl font-semibold">{lead.name}</h2>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-zinc-400 hover:text-white"
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
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
          />

          <input
            name="phone"
            defaultValue={lead.phone ?? ''}
            placeholder="Telefone"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
          />

          <input
            name="email"
            type="email"
            defaultValue={lead.email ?? ''}
            placeholder="E-mail"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <input
              name="source"
              defaultValue={lead.source ?? ''}
              placeholder="Origem"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
            />

            <input
              name="campaign"
              defaultValue={lead.campaign ?? ''}
              placeholder="Campanha"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-zinc-500">Etapa atual</label>
            <select
              name="stageId"
              value={selectedStageId}
              onChange={(event) => setSelectedStageId(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          {isSaleStage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <label className="mb-2 block text-sm font-medium text-emerald-300">
                Valor da venda
              </label>
              <input
                name="saleValue"
                type="number"
                step="0.01"
                min="0"
                defaultValue={lead.sale_value ?? ''}
                placeholder="R$ 0,00"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Esse valor alimenta automaticamente os indicadores de vendas da Visão geral.
              </p>
            </div>
          )}

          <textarea
            name="notes"
            rows={5}
            defaultValue={lead.notes ?? ''}
            placeholder="Observações sobre o lead"
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-500"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium transition hover:bg-purple-500 disabled:opacity-60"
          >
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>

        <div className="mt-8 border-t border-zinc-800 pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Histórico</h3>
            <span className="text-xs text-zinc-500">
              {history.length} {history.length === 1 ? 'evento' : 'eventos'}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
              Nenhum histórico registrado ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <p className="text-sm text-zinc-200">{getHistoryText(item)}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(item.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
