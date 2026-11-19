'use client'

import { FormEvent, useState } from 'react'
import { MEETING_MISS_REASONS, fromLocalInput } from '@/lib/crm'

export type MeetingDialogMode = 'nao_compareceu' | 'desmarcada' | 'remarcar'

const TITLES: Record<MeetingDialogMode, string> = {
  nao_compareceu: 'Não compareceu',
  desmarcada: 'Desmarcou a reunião',
  remarcar: 'Reagendar a reunião',
}

type Props = {
  leadId: string
  leadName: string
  mode: MeetingDialogMode
  onCancel: () => void
  onDone: () => void
}

// Faltou / desmarcou (com motivo e, se já souber, a nova data) ou só reagendar.
export function MeetingDialog({ leadId, leadName, mode, onCancel, onDone }: Props) {
  const [reason, setReason] = useState('')
  const [meetingAt, setMeetingAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const needsReason = mode !== 'remarcar'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const response = await fetch('/api/leads/meeting', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        status: mode,
        reason: needsReason ? reason : undefined,
        // Converte no navegador: o servidor roda em UTC e erraria o fuso.
        meetingAt: fromLocalInput(meetingAt) ?? undefined,
      }),
    })
    const result = await response.json()
    setSaving(false)

    if (!response.ok) {
      setError(result.error || 'Não foi possível salvar.')
      return
    }

    onDone()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-1000/70 px-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-950 p-6 shadow-2xl shadow-black/50"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-300">{TITLES[mode]}</p>
        <h2 className="mt-1.5 truncate font-display text-xl font-semibold text-ink-50">{leadName}</h2>

        {needsReason && (
          <label className="mt-5 block text-sm text-ink-300">
            Motivo
            <select
              required
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-auron-500"
            >
              <option value="" disabled>
                Escolha o motivo
              </option>
              {MEETING_MISS_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 block text-sm text-ink-300">
          {needsReason ? 'Nova data (se já combinou)' : 'Nova data e hora'}
          <input
            type="datetime-local"
            required={!needsReason}
            autoFocus={!needsReason}
            value={meetingAt}
            onChange={(event) => setMeetingAt(event.target.value)}
            className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none [color-scheme:dark] focus:border-auron-500"
          />
        </label>
        {needsReason && (
          <p className="mt-2 text-xs leading-5 text-ink-500">
            Sem data, o lead fica em Reunião com o selo amarelo e um lembrete para reagendar hoje.
          </p>
        )}

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:text-ink-200"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-auron-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-auron-500 disabled:opacity-60"
          >
            {saving ? 'Salvando...' : meetingAt ? 'Salvar e reagendar' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
