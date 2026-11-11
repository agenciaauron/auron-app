'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fromLocalInput } from '@/lib/crm'

const fieldClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-auron-500'

export function NewLeadForm() {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState(false)

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
        origin: form.get('origin'),
        nextActionAt: fromLocalInput(form.get('nextActionAt')),
        nextActionNote: form.get('nextActionNote'),
        // Segunda tentativa depois do aviso de telefone repetido.
        force: duplicate,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Erro ao cadastrar lead.')
      setDuplicate(Boolean(result.duplicate))
      setLoading(false)
      return
    }

    setOpen(false)
    setDuplicate(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setError('')
          setDuplicate(false)
          setOpen(true)
        }}
        className="rounded-lg bg-auron-600 px-4 py-2 font-medium text-white transition hover:bg-auron-500"
      >
        + Novo lead
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-800 bg-ink-900 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-auron-400">Cadastro manual</p>
            <h2 className="mt-1 text-xl font-semibold">Novo lead</h2>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-ink-400 hover:text-white"
          >
            Fechar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <select name="origin" defaultValue="prospeccao" className={fieldClass}>
            <option value="prospeccao">Prospecção (o SDR foi atrás)</option>
            <option value="trafego">Tráfego (chegou pelo anúncio/site)</option>
          </select>

          <input name="name" required placeholder="Nome do lead / empresa" className={fieldClass} />

          <input
            name="phone"
            placeholder="Telefone"
            onChange={() => setDuplicate(false)}
            className={fieldClass}
          />

          <input name="email" type="email" placeholder="E-mail" className={fieldClass} />

          <div className="grid gap-4 sm:grid-cols-2">
            <input name="source" placeholder="Origem, ex: Instagram, indicação" className={fieldClass} />
            <input name="campaign" placeholder="Campanha / nicho" className={fieldClass} />
          </div>

          <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-4">
            <p className="text-sm font-medium text-ink-200">Próximo contato</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                name="nextActionAt"
                type="datetime-local"
                className={`${fieldClass} text-sm [color-scheme:dark]`}
              />
              <input name="nextActionNote" placeholder="O que fazer" className={`${fieldClass} text-sm`} />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-auron-600 px-4 py-3 font-medium transition hover:bg-auron-500 disabled:opacity-60"
          >
            {loading ? 'Salvando...' : duplicate ? 'Cadastrar mesmo assim' : 'Cadastrar lead'}
          </button>
        </form>
      </div>
    </div>
  )
}
