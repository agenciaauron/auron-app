'use client'

import { FormEvent, useState } from 'react'
import { LOST_REASONS } from '@/lib/lead-cleanup'
import { isMeetingStage } from '@/lib/crm'
import type { Stage } from '@/lib/lead-types'

export type StageExtras = {
  lostReason?: string
  meetingAt?: string
}

// Etapas que pedem informação antes de mover: perda (motivo) e reunião (data e hora).
export function stageNeedsInput(stage: Stage | undefined) {
  return Boolean(stage && (stage.is_lost || isMeetingStage(stage)))
}

type Props = {
  stage: Stage
  leadName: string
  onCancel: () => void
  onConfirm: (extras: StageExtras) => void
}

export function StageChangeDialog({ stage, leadName, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const [meetingAt, setMeetingAt] = useState('')
  const lost = stage.is_lost

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lost) onConfirm({ lostReason: reason })
    else onConfirm({ meetingAt })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1000/70 px-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-950 p-6 shadow-2xl shadow-black/50"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">
          Mover para {stage.name}
        </p>
        <h2 className="mt-1.5 truncate font-display text-xl font-semibold text-ink-50">{leadName}</h2>

        {lost ? (
          <label className="mt-5 block text-sm text-ink-300">
            Motivo da perda
            <select
              required
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-red-500"
            >
              <option value="" disabled>
                Escolha o motivo
              </option>
              {LOST_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="mt-5 block text-sm text-ink-300">
            Data e hora da reunião
            <input
              type="datetime-local"
              required
              autoFocus
              value={meetingAt}
              onChange={(event) => setMeetingAt(event.target.value)}
              className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none [color-scheme:dark] focus:border-auron-500"
            />
            <span className="mt-2 block text-xs text-ink-500">
              A reunião aparece na tela Hoje para quem vai conduzir.
            </span>
          </label>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-ink-900"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition ${
              lost ? 'bg-red-600 hover:bg-red-500' : 'bg-auron-600 hover:bg-auron-500'
            }`}
          >
            Confirmar
          </button>
        </div>
      </form>
    </div>
  )
}
