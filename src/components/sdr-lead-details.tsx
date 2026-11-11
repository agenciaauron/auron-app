'use client'

import { FormEvent, ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MessageCircle, X } from 'lucide-react'
import { LOST_REASONS, displayMessage, formatPhone, whatsappUrl } from '@/lib/lead-cleanup'
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
  // Modo controlado: a tela abre a ficha (clique no card/linha) e fecha por onClose.
  open?: boolean
  onClose?: () => void
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

const inputClass =
  'w-full rounded-lg border border-ink-800 bg-ink-900/60 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-auron-500 [color-scheme:dark]'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-400">{label}</span>
      {children}
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-ink-800/80 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function SdrLeadDetails({
  lead,
  stages,
  history,
  activities = [],
  team = [],
  role = 'member',
  open: controlledOpen,
  onClose,
  triggerLabel,
  triggerClassName,
}: Props) {
  const router = useRouter()
  const manager = isManager(role)
  const controlled = controlledOpen !== undefined

  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedStageId, setSelectedStageId] = useState(lead.stage_id ?? '')
  const [origin, setOrigin] = useState(normalizeOrigin(lead.origin))
  const [deleting, setDeleting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [activityType, setActivityType] = useState<ActivityType | null>(null)
  const [activityNote, setActivityNote] = useState('')
  const [activityNext, setActivityNext] = useState('')
  const [activityNextNote, setActivityNextNote] = useState('')
  const [activitySaving, setActivitySaving] = useState(false)
  const [activityError, setActivityError] = useState('')

  const open = controlled ? controlledOpen : internalOpen
  const selectedStage = stages.find((stage) => stage.id === selectedStageId)
  const currentStage = stages.find((stage) => stage.id === lead.stage_id)
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

  function close() {
    if (controlled) onClose?.()
    else setInternalOpen(false)
  }

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
            ? `${getStageName(item.from_stage_id)} → ${getStageName(item.to_stage_id)}`
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

    close()
    router.refresh()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setError('')

    const form = new FormData(event.currentTarget)

    const response = await fetch('/api/leads/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
        strict: true,
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
    close()
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
    setInternalOpen(true)
  }

  if (!open) {
    if (controlled) return null
    return (
      <button
        type="button"
        onClick={openDetails}
        className={
          triggerClassName ??
          'rounded-md border border-ink-700 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-900'
        }
      >
        {triggerLabel ?? 'Ver ficha'}
      </button>
    )
  }

  const waUrl = whatsappUrl(lead.phone)
  const metaLine = metaEligible
    ? [
        `Qualificado: ${lead.meta_qualified_sent_at ? `enviado ${formatDateTime(lead.meta_qualified_sent_at)}` : 'não enviado'}`,
        `Venda: ${lead.meta_purchase_sent_at ? `enviada ${formatDateTime(lead.meta_purchase_sent_at)}` : 'não enviada'}`,
      ].join(' · ')
    : 'Lead sem vínculo com anúncio ou site: nenhum evento é enviado.'

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-1000/70 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) close()
      }}
    >
      <div className="flex h-full w-full max-w-[520px] flex-col border-l border-ink-800 bg-ink-950 text-left shadow-2xl shadow-black/50">
        {/* Cabeçalho */}
        <div className="border-b border-ink-800/80 px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-semibold text-ink-50">{lead.name}</h2>
              {lead.phone && <p className="mt-1 font-mono text-sm text-ink-400">{formatPhone(lead.phone)}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {waUrl && (
                <a
                  href={waUrl}
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
                onClick={close}
                aria-label="Fechar ficha"
                className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
              >
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                currentStage?.is_won
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : currentStage?.is_lost
                    ? 'bg-rose-500/10 text-rose-300'
                    : 'bg-auron-500/12 text-auron-200'
              }`}
            >
              {currentStage?.name ?? 'Sem etapa'}
            </span>
            <span className="rounded-full bg-ink-800 px-2.5 py-1 text-ink-300">
              {ORIGIN_LABELS[normalizeOrigin(lead.origin)]}
            </span>
            {sdrName && <span className="text-ink-500">SDR: {sdrName}</span>}
          </div>

          {lead.last_message && (
            <div className="mt-4 rounded-lg bg-ink-900/70 px-3.5 py-3">
              <p className="text-[11px] text-ink-500">
                Última mensagem{lead.last_message_at && ` · ${formatDateTime(lead.last_message_at)}`}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-200">“{displayMessage(lead.last_message)}”</p>
            </div>
          )}

          {/* Registro rápido do que foi feito */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {QUICK_ACTIVITIES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => (activityType === type ? setActivityType(null) : startActivity(type))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activityType === type
                    ? 'border-auron-500 bg-auron-500/15 text-ink-50'
                    : 'border-ink-700 text-ink-300 hover:border-ink-600 hover:bg-ink-900'
                }`}
              >
                {type === 'nota' ? '+ Anotação' : `+ ${ACTIVITY_LABELS[type]}`}
              </button>
            ))}
          </div>

          {activityType && (
            <form onSubmit={saveActivity} className="mt-3 space-y-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3.5">
              <textarea
                rows={2}
                value={activityNote}
                onChange={(event) => setActivityNote(event.target.value)}
                required={activityType === 'nota'}
                placeholder={activityType === 'nota' ? 'Escreva a anotação' : 'Observação (opcional)'}
                className={`${inputClass} resize-none`}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Próximo contato">
                  <input
                    type="datetime-local"
                    value={activityNext}
                    onChange={(event) => setActivityNext(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="O que fazer">
                  <input
                    value={activityNextNote}
                    onChange={(event) => setActivityNextNote(event.target.value)}
                    placeholder="Ex.: mandar proposta"
                    className={inputClass}
                  />
                </Field>
              </div>
              {activityError && <p className="text-sm text-rose-300">{activityError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActivityType(null)}
                  className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:text-ink-200"
                >
                  Cancelar
                </button>
                <button
                  disabled={activitySaving}
                  className="rounded-lg bg-auron-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-auron-500 disabled:opacity-60"
                >
                  {activitySaving ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Corpo */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="pipeline-scrollbar flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <Section title="Próximo contato">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quando">
                  <input
                    name="nextActionAt"
                    type="datetime-local"
                    defaultValue={toLocalInput(lead.next_action_at)}
                    className={inputClass}
                  />
                </Field>
                <Field label="O que fazer">
                  <input
                    name="nextActionNote"
                    defaultValue={lead.next_action_note ?? ''}
                    placeholder="Ex.: ligar de novo"
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Negociação">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Etapa">
                  <select
                    name="stageId"
                    value={selectedStageId}
                    onChange={(event) => setSelectedStageId(event.target.value)}
                    className={inputClass}
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Frente">
                  <select
                    value={origin}
                    onChange={(event) => setOrigin(normalizeOrigin(event.target.value))}
                    className={inputClass}
                  >
                    <option value="trafego">Tráfego</option>
                    <option value="prospeccao">Prospecção</option>
                  </select>
                </Field>
              </div>

              {(isMeeting || lead.meeting_at) && (
                <Field
                  label={`Reunião${
                    lead.meeting_status
                      ? ` · ${MEETING_STATUS_LABELS[lead.meeting_status as MeetingStatus] ?? lead.meeting_status}`
                      : ''
                  }`}
                >
                  <input
                    name="meetingAt"
                    type="datetime-local"
                    required={isMeeting}
                    defaultValue={toLocalInput(lead.meeting_at)}
                    className={inputClass}
                  />
                </Field>
              )}

              {isSaleStage && (
                <Field label="Valor da venda (1ª mensalidade)">
                  <input
                    name="saleValue"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={lead.sale_value ?? ''}
                    placeholder="0,00"
                    className={inputClass}
                  />
                </Field>
              )}

              {isLostStage && (
                <Field label="Motivo da perda">
                  <select name="lostReason" required defaultValue={lead.lost_reason ?? ''} className={inputClass}>
                    <option value="" disabled>
                      Escolha o motivo
                    </option>
                    {LOST_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {manager && (
                <Field label="SDR responsável (recebe a comissão)">
                  <select name="sdrId" defaultValue={lead.sdr_id ?? ''} className={inputClass}>
                    <option value="">Nenhum</option>
                    {sdrs.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </Section>

            <Section title="Contato">
              <Field label="Nome">
                <input name="name" required defaultValue={lead.name} className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telefone">
                  <input name="phone" defaultValue={lead.phone ?? ''} className={inputClass} />
                </Field>
                <Field label="E-mail">
                  <input name="email" type="email" defaultValue={lead.email ?? ''} className={inputClass} />
                </Field>
              </div>
            </Section>

            <Section title="Origem">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Origem">
                  <input name="source" defaultValue={lead.source ?? ''} className={inputClass} />
                </Field>
                <Field label="Campanha">
                  <input name="campaign" defaultValue={lead.campaign ?? ''} className={inputClass} />
                </Field>
              </div>
              <p className="text-xs leading-5 text-ink-500">
                <span className="font-medium text-ink-400">Meta:</span> {metaLine}
              </p>
            </Section>

            <Section title="Observações">
              <textarea
                name="notes"
                rows={4}
                defaultValue={lead.notes ?? ''}
                placeholder="Anotações sobre o lead"
                className={`${inputClass} resize-none`}
              />
            </Section>

            <section className="border-t border-ink-800/80 pt-5">
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 transition hover:text-ink-300"
              >
                Histórico e atividades ({timeline.length})
                <ChevronDown
                  className={`h-4 w-4 transition ${showHistory ? 'rotate-180' : ''}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>

              {showHistory && (
                <ol className="mt-3 space-y-2.5 border-l border-ink-800 pl-4">
                  {timeline.length === 0 && <li className="text-sm text-ink-500">Nenhum histórico ainda.</li>}
                  {timeline.map((item) => (
                    <li key={item.id} className="text-sm">
                      <p className="text-ink-200">{item.text}</p>
                      {item.note && <p className="text-ink-400">{item.note}</p>}
                      <p className="text-xs text-ink-500">
                        {formatDateTime(item.created_at)}
                        {item.who && ` · ${item.who}`}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* Rodapé fixo */}
          <div className="border-t border-ink-800/80 px-6 py-4">
            {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
            <div className="flex items-center gap-3">
              {manager && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || loading}
                  className="rounded-lg px-3 py-2.5 text-sm text-ink-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-60"
                >
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              )}
              <button
                disabled={loading}
                className="ml-auto rounded-lg bg-auron-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-auron-500 disabled:opacity-60"
              >
                {loading ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
