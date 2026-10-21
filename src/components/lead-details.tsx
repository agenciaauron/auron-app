'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LOST_REASONS } from '@/lib/lead-cleanup'

type Stage = {
  id: string
  name: string
  is_won?: boolean
  is_lost?: boolean
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
  last_message?: string | null
  last_message_at?: string | null
  lost_reason?: string | null
  integration_source: string | null
  ctwa_clid: string | null
  meta_qualified_sent_at: string | null
  meta_purchase_sent_at: string | null
  meta_last_error: string | null
  meta_last_error_at: string | null
}

type HistoryItem = {
  id: string
  event_type: string
  from_stage_id: string | null
  to_stage_id: string | null
  created_at: string
}

type MetaResult = {
  status?: 'sent' | 'already_sent' | 'waiting_value' | 'not_eligible' | 'error'
  event_name?: 'QualifiedLead' | 'Purchase'
  message?: string
  error?: string
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

  const [deleting, setDeleting] = useState(false)

  const selectedStage = stages.find((stage) => stage.id === selectedStageId)
  const isSaleStage = Boolean(selectedStage?.is_won)
  const isLostStage = Boolean(selectedStage?.is_lost)

  async function handleDelete() {
    if (!confirm(`Excluir ${lead.name} permanentemente? Essa ação não pode ser desfeita.`)) {
      return
    }

    setDeleting(true)
    setError('')

    const response = await fetch('/api/leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', leadIds: [lead.id] }),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Não foi possível excluir o lead.')
      setDeleting(false)
      return
    }

    setOpen(false)
    router.refresh()
  }
  const metaEligible = lead.integration_source === 'whatsapp' && Boolean(lead.ctwa_clid)

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
        lostReason: isLostStage ? form.get('lostReason') : null,
        stageId: selectedStageId,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Não foi possível atualizar o lead.')
      setLoading(false)
      return
    }

    const meta = result.meta as MetaResult | null | undefined

    if (meta?.status === 'error') {
      setError(`Lead salvo, mas a Meta não confirmou o evento: ${meta.error || 'erro desconhecido'}`)
      setLoading(false)
      router.refresh()
      return
    }

    if (meta?.status === 'waiting_value') {
      setError(meta.message || 'Informe o valor da venda para enviar o evento à Meta.')
      setLoading(false)
      router.refresh()
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

        {lead.last_message && (
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs text-zinc-500">
              Última mensagem do lead
              {lead.last_message_at && ` · ${formatDate(lead.last_message_at)}`}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">“{lead.last_message}”</p>
          </div>
        )}

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

          {isLostStage && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <label className="mb-2 block text-sm font-medium text-red-300">
                Motivo da perda
              </label>
              <select
                name="lostReason"
                defaultValue={lead.lost_reason ?? ''}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-red-500"
              >
                <option value="">Não informado</option>
                {LOST_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                Esse valor alimenta automaticamente os indicadores de vendas da Visão geral e o evento Purchase da Meta.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-200">Meta</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Retorno dos eventos enviados pelo CRM
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  metaEligible
                    ? 'bg-purple-500/10 text-purple-300'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {metaEligible ? 'Anúncio vinculado' : 'Sem CTWA'}
              </span>
            </div>

            {metaEligible ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-400">QualifiedLead</span>
                  {lead.meta_qualified_sent_at ? (
                    <span className="text-right text-emerald-400">
                      Enviado · {formatDate(lead.meta_qualified_sent_at)}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Ainda não enviado</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-400">Purchase</span>
                  {lead.meta_purchase_sent_at ? (
                    <span className="text-right text-emerald-400">
                      Enviado · {formatDate(lead.meta_purchase_sent_at)}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Ainda não enviado</span>
                  )}
                </div>

                {lead.meta_last_error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                    Último erro da Meta: {lead.meta_last_error}
                    {lead.meta_last_error_at && (
                      <span className="mt-1 block text-red-400/70">
                        {formatDate(lead.meta_last_error_at)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                Esse lead não possui ctwa_clid. Eventos de conversão não serão enviados para a Meta porque ele não veio de um anúncio Click-to-WhatsApp.
              </p>
            )}
          </div>

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

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || loading}
          className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm text-red-400/80 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
        >
          {deleting ? 'Excluindo...' : 'Excluir lead'}
        </button>

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
