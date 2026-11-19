'use client'

import { CONVERSATION_BADGES, CONVERSATION_KINDS, type ConversationKind } from '@/lib/crm'

type Props = {
  current: ConversationKind | null
  manual: boolean
  disabled?: boolean
  onPick: (kind: ConversationKind | null) => void
}

// Opções para o SDR corrigir o selo automático. "Automático" desfaz a correção.
export function ConversationPicker({ current, manual, disabled, onPick }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Corrigir o selo da conversa">
      {CONVERSATION_KINDS.map((kind) => {
        const badge = CONVERSATION_BADGES[kind]
        const selected = current === kind
        return (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation()
              onPick(kind)
            }}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
              selected ? `${badge.card} ${badge.chip}` : 'border-ink-700 text-ink-300 hover:bg-ink-800'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${badge.dot}`} aria-hidden />
            {badge.label}
          </button>
        )
      })}
      {manual && (
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            onPick(null)
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-400 transition hover:bg-ink-800 hover:text-ink-200 disabled:opacity-60"
        >
          Voltar ao automático
        </button>
      )}
    </div>
  )
}
