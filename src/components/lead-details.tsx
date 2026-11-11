'use client'

import { FormEvent, ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import { LOST_REASONS, formatPhone, whatsappUrl } from '@/lib/lead-cleanup'
import {
  ACTIVITY_LABELS,
  MEETING_STATUS_LABELS,
  ORIGIN_LABELS,
  QUICK_ACTIVITIES,
  formatDateTime,
  fromLocalInput,
  isManager,
  isMeetingStage,
  stageBelongsTo,
  toLocalInput,
  normalizeOrigin,
  type ActivityType,
  type MeetingStatus,
  type TeamMember,
} from '@/lib/crm'
import type { Activity, HistoryItem, Lead, Stage } from '@/lib/lead-types'

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
  activities?: Activity[]
  team?: TeamMember[]
  role?: string
  triggerLabel?: ReactNode
  triggerClassName?: string
}

type TimelineItem = {
  id: string
  text: string
  note?: string | null
  who?: string | null
  created_at: string
}

const fieldClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-auron-500'

export function LeadDetails({
  lead,
  stages,
  history,
  activities = [],
  team = [],
  role = 'member',
  triggerLabel,
  triggerClassName,
}: Props) {
  const router = useRouter()
  const manager = isManager(role)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedStageId, setSelectedStageId] = useState(lead.stage_id ?? '')
  const [origin, setOrigin] = useState(normalizeOrigin(lead.origin))
  const [deleting, setDeleting] = useState(false)

  const [activityType, setActivityType] = useState<ActivityType | null>(null)
  const [activityNote, setActivityNote] = useState('')
  const [activityNext, setActivityNext] = useState('')
  const [activityNextNote, setActivityNextNote] = useState('')
  const [activitySaving, setActivitySaving] = useState(false)
  const [activityError, setActivityError] = useState('')

  const selectedStage = stages.find((stage) => stage.id === selectedStageId)
  const isSaleStage = Boolean(selectedStage?.is_won)
  const isLostStage = Boolean(selectedStage?.is_lost)
  const isMeeting = isMeetingStage(selectedStage)
  const stageOptions = stages.filter(
    (stage) => stageBelongsTo(stage, origin) || stage.id === lead.stage_id
  )
  const sdrs = team.filter((member) => member.role === 'sdr')
  const sdrName = team.find((member) => member.user_id === lead.sdr_id)?.name

  const isLandingPage = (lead.source ?? '').toLowerCase().includes('landing')
  const metaEligible =
    lead.integration_source === 'whatsapp' && (Boolean(lead.ctwa_clid) || isLandingPage)

  function memberName(userId: string | null | undefined) {
    if (!userId) return null
    return team.find((member) => member.user_id === userId)?.name ?? null
  }

  function getStageName(stageId: string | null) {
    if (!stageId) return 'Etapa não identificada'
    return stages.find((stage) => stage.id === stageId)?.name ?? 'Etapa não identificada'
  }

  const timeline: TimelineItem[] = [
    ...history.map((item) => ({
      id: `h-${item.id}`,
      text:
        item.event_type === 'created'
          ? 'Lead adicionado ao CRM'
          : item.event_type === 'stage_changed'
            ? `Movido de ${getStageName(item.from_stage_id)} para ${getStageName(item.to_stage_id)}`
            : 'Atualização registrada',
      who: memberName(item.user_id),
      created_at: item.created_at,
    })),
    ...activities.map((item) => ({
      id: `a-${item.id}`,
      text: ACTIVITY_LABELS[item.type as ActivityType] ?? 'Atividade',
      note: item.note,
      who: memberName(item.user_id),
      created_at: item.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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
        origin,
        nextActionAt: fromLocalInput(form.get('nextActionAt')) ?? '',
        nextActionNote: form.get('nextActionNote'),
        meetingAt: fromLocalInput(form.get('meetingAt')) ?? '',
        ...(manager ? { sdrId: form.get('sdrId') } : {}),
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

  function startActivity(type: ActivityType) {
    setActivityType(type)
    setActivityNote('')
    setActivityNext(toLocalInput(lead.next_action_at))
    setActivityNextNote(lead.next_action_note ?? '')
    setActivityError('')
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activityType) return

    setActivitySaving(true)
    setActivityError('')

    const response = await fetch('/api/leads/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: lead.id,
        type: activityType,
        note: activityNote,
        nextActionAt: fromLocalInput(activityNext) ?? '',
        nextActionNote: activityNextNote,
      }),
    })
    const result = await response.json()

    setActivitySaving(false)

    if (!response.ok) {
      setActivityError(result.error || 'Não foi possível registrar.')
      return
    }

    setActivityType(null)
    router.refresh()
  }

  function openDetails() {
    setSelectedStageId(lead.stage_id ?? '')
    setOrigin(normalizeOrigin(lead.origin))
    setActivityType(null)
    setError('')
    setOpen(true)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openDetails}
        className={
          triggerClassName ??
          'mt-3 w-full rounded-md border border-ink-700 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-900'
        }
      >
        {triggerLabel ?? 'Ver ficha'}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-1000/70 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) setOpen(false)
      }}
    >
      <div className="pipeline-scrollbar h-full w-full max-w-lg overflow-y-auto border-l border-ink-800 bg-ink-950 p-6 text-left shadow-2xl shadow-black/50">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">
              Ficha do lead · {ORIGIN_LABELS[normalizeOrigin(lead.origin)]}
            </p>
            <h2 className="mt-1.5 truncate font-display text-2xl font-semibold text-ink-50">
              {lead.name}
            </h2>
            {lead.phone && (
              <p className="mt-1 font-mono text-sm text-ink-400">{formatPhone(lead.phone)}</p>
            )}
            {sdrName && <p className="mt-1 text-xs text-ink-500">SDR: {sdrName}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {whatsappUrl(lead.phone) && (
              <a
                href={whatsappUrl(lead.phone) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg bg-whatsapp/15 px-3 py-2 text-sm font-semibold text-whatsapp transition hover:bg-whatsapp/25"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar ficha"
              className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>

        {lead.last_message && (
          <div className="mb-5 rounded-xl border border-ink-800 bg-ink-950/70 p-4">
            <p className="text-xs text-ink-500">
              Última mensagem do lead
              {lead.last_message_at && ` · ${formatDateTime(lead.last_message_at)}`}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-200">“{lead.last_message}”</p>
          </div>
        )}

        {/* Registro rápido do que foi feito */}
        <div className="mb-5 rounded-xl border border-ink-800 bg-ink-900/40 p-4">
          <p className="text-sm font-medium text-ink-200">Registrar atividade</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_ACTIVITIES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => startActivity(type)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  activityType === type
                    ? 'border-auron-500 bg-auron-500/15 text-ink-50'
                    : 'border-ink-700 text-ink-300 hover:bg-ink-800'
                }`}
              >
                {type === 'nota' ? 'Anotação' : ACTIVITY_LABELS[type]}
              </button>
            ))}
          </div>

          {activityType && (
            <form onSubmit={saveActivity} className="mt-4 space-y-3">
              <textarea
                rows={2}
                value={activityNote}
                onChange={(event) => setActivityNote(event.target.value)}
                required={activityType === 'nota'}
                placeholder={activityType === 'nota' ? 'Escreva a anotação' : 'Observação (opcional)'}
                className={`${fieldClass} resize-none text-sm`}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-ink-500">
                  Próximo contato
                  <input
                    type="datetime-local"
                    value={activityNext}
                    onChange={(event) => setActivityNext(event.target.value)}
                    className={`${fieldClass} mt-1 text-sm [color-scheme:dark]`}
                  />
                </label>
                <label className="text-xs text-ink-500">
                  O que fazer
                  <input
                    value={activityNextNote}
                    onChange={(event) => setActivityNextNote(event.target.value)}
                    placeholder="Ex.: mandar proposta"
                    className={`${fieldClass} mt-1 text-sm`}
                  />
                </label>
              </div>
              {activityError && <p className="text-sm text-red-400">{activityError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActivityType(null)}
                  className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:text-ink-200"
                >
                  Cancelar
                </button>
                <button
                  disabled={activitySaving}
                  className="flex-1 rounded-lg bg-auron-600 px-3 py-2 text-sm font-medium transition hover:bg-auron-500 disabled:opacity-60"
                >
                  {activitySaving ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </form>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input name="name" required defaultValue={lead.name} placeholder="Nome" className={fieldClass} />

          <input name="phone" defaultValue={lead.phone ?? ''} placeholder="Telefone" className={fieldClass} />

          <input
            name="email"
            type="email"
            defaultValue={lead.email ?? ''}
            placeholder="E-mail"
            className={fieldClass}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <input name="source" defaultValue={lead.source ?? ''} placeholder="Origem" className={fieldClass} />
            <input
              name="campaign"
              defaultValue={lead.campaign ?? ''}
              placeholder="Campanha"
              className={fieldClass}
            />
          </div>

          <div className={`grid gap-4 ${manager ? 'sm:grid-cols-2' : ''}`}>
            <div>
              <label className="mb-1.5 block text-xs text-ink-500">Frente</label>
              <select
                value={origin}
                onChange={(event) => setOrigin(normalizeOrigin(event.target.value))}
                className={fieldClass}
              >
                <option value="trafego">Tráfego (chegou pelo anúncio/site)</option>
                <option value="prospeccao">Prospecção (SDR foi atrás)</option>
              </select>
            </div>

            {manager && (
              <div>
                <label className="mb-1.5 block text-xs text-ink-500">SDR responsável</label>
                <select name="sdrId" defaultValue={lead.sdr_id ?? ''} className={fieldClass}>
                  <option value="">Nenhum</option>
                  {sdrs.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-ink-500">Etapa atual</label>
            <select
              name="stageId"
              value={selectedStageId}
              onChange={(event) => setSelectedStageId(event.target.value)}
              className={fieldClass}
            >
              {stageOptions.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-ink-800 bg-ink-950/70 p-4">
            <p className="text-sm font-medium text-ink-200">Próximo contato</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                name="nextActionAt"
                type="datetime-local"
                defaultValue={toLocalInput(lead.next_action_at)}
                className={`${fieldClass} text-sm [color-scheme:dark]`}
              />
              <input
                name="nextActionNote"
                defaultValue={lead.next_action_note ?? ''}
                placeholder="O que fazer"
                className={`${fieldClass} text-sm`}
              />
            </div>
            <p className="mt-2 text-xs text-ink-500">Todo lead em andamento deve ter um próximo passo.</p>
          </div>

          {(isMeeting || lead.meeting_at) && (
            <div className="rounded-xl border border-auron-500/20 bg-auron-500/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-auron-200">Reunião</label>
                {lead.meeting_status && (
                  <span className="rounded-full bg-ink-800 px-2.5 py-1 text-[11px] text-ink-300">
                    {MEETING_STATUS_LABELS[lead.meeting_status as MeetingStatus] ?? lead.meeting_status}
                  </span>
                )}
              </div>
              <input
                name="meetingAt"
                type="datetime-local"
                required={isMeeting}
                defaultValue={toLocalInput(lead.meeting_at)}
                className={`${fieldClass} mt-3 text-sm [color-scheme:dark]`}
              />
            </div>
          )}

          {isLostStage && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <label className="mb-2 block text-sm font-medium text-red-300">Motivo da perda</label>
              <select
                name="lostReason"
                required
                defaultValue={lead.lost_reason ?? ''}
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-red-500"
              >
                <option value="" disabled>
                  Escolha o motivo
                </option>
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
                Valor da venda (1ª mensalidade)
              </label>
              <input
                name="saleValue"
                type="number"
                step="0.01"
                min="0"
                defaultValue={lead.sale_value ?? ''}
                placeholder="R$ 0,00"
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <p className="mt-2 text-xs text-ink-500">
                Esse valor alimenta a Visão geral, a comissão do SDR e o evento Purchase da Meta.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-ink-800 bg-ink-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-200">Meta</p>
                <p className="mt-1 text-xs text-ink-500">Retorno dos eventos enviados pelo CRM</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  metaEligible ? 'bg-auron-500/10 text-auron-300' : 'bg-ink-800 text-ink-500'
                }`}
              >
                {metaEligible ? (isLandingPage && !lead.ctwa_clid ? 'Site vinculado' : 'Anúncio vinculado') : 'Sem vínculo'}
              </span>
            </div>

            {metaEligible ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-ink-400">Lead qualificado</span>
                  {lead.meta_qualified_sent_at ? (
                    <span className="text-right text-emerald-400">
                      Enviado · {formatDateTime(lead.meta_qualified_sent_at)}
                    </span>
                  ) : (
                    <span className="text-ink-600">Ainda não enviado</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-ink-400">Venda</span>
                  {lead.meta_purchase_sent_at ? (
                    <span className="text-right text-emerald-400">
                      Enviado · {formatDateTime(lead.meta_purchase_sent_at)}
                    </span>
                  ) : (
                    <span className="text-ink-600">Ainda não enviado</span>
                  )}
                </div>

                {lead.meta_last_error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                    Último erro da Meta: {lead.meta_last_error}
                    {lead.meta_last_error_at && (
                      <span className="mt-1 block text-red-400/70">{formatDateTime(lead.meta_last_error_at)}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs leading-5 text-ink-500">
                Esse lead não veio de um anúncio de WhatsApp nem do site com código de atendimento, então
                nenhum evento é enviado para a Meta.
              </p>
            )}
          </div>

          <textarea
            name="notes"
            rows={5}
            defaultValue={lead.notes ?? ''}
            placeholder="Observações sobre o lead"
            className={`${fieldClass} resize-none`}
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-auron-600 px-4 py-3 font-medium transition hover:bg-auron-500 disabled:opacity-60"
          >
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>

        {manager && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || loading}
            className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm text-red-400/80 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
          >
            {deleting ? 'Excluindo...' : 'Excluir lead'}
          </button>
        )}

        <div className="mt-8 border-t border-ink-800 pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Histórico</h3>
            <span className="text-xs text-ink-500">
              {timeline.length} {timeline.length === 1 ? 'evento' : 'eventos'}
            </span>
          </div>

          {timeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-700 p-4 text-sm text-ink-500">
              Nenhum histórico registrado ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {timeline.map((item) => (
                <div key={item.id} className="rounded-lg border border-ink-800 bg-ink-950 p-4">
                  <p className="text-sm text-ink-200">{item.text}</p>
                  {item.note && <p className="mt-1 text-sm text-ink-400">{item.note}</p>}
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateTime(item.created_at)}
                    {item.who && ` · ${item.who}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
