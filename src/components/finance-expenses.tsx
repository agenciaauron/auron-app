'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  CHANNEL_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  FINANCE_CHANNELS,
  RECURRING_CATEGORIES,
  currentMonthKey,
  defaultChannelFor,
  money,
  monthName,
  monthOf,
  recurringActiveIn,
  shiftMonth,
  type ExpenseCategory,
  type PanelExpense,
  type PanelRecurring,
} from '@/lib/finance'

type Props = {
  expenses: PanelExpense[]
  recurring: PanelRecurring[]
}

const inputClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-auron-500 [color-scheme:dark]'

const NO_CHANNEL = new Set<ExpenseCategory>(['retirada', 'reserva', 'imposto', 'devolucao'])

// Atalhos para o que vocês anotam com mais frequência.
const PRESETS: { label: string; category: ExpenseCategory; description: string }[] = [
  { label: '+ Recarga Meta', category: 'anuncios', description: 'Recarga Meta (Facebook)' },
  { label: '+ Imposto (DAS)', category: 'imposto', description: 'DAS (Receita Federal)' },
  { label: '+ Retirada', category: 'retirada', description: 'Distribuição de lucro: ' },
]

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shortDate(value: string) {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}

export function FinanceExpenses({ expenses, recurring }: Props) {
  const router = useRouter()
  const thisMonth = currentMonthKey()
  const [month, setMonth] = useState(thisMonth)
  const [category, setCategory] = useState<ExpenseCategory>('anuncios')
  const [description, setDescription] = useState('Recarga Meta (Facebook)')
  const [formKey, setFormKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [recurringOpen, setRecurringOpen] = useState(false)

  const monthExpenses = useMemo(
    () => expenses.filter((item) => monthOf(item.spent_at) === month).sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
    [expenses, month]
  )
  const paidRecurring = new Set(monthExpenses.map((item) => item.recurring_id).filter(Boolean))
  const monthRecurring = recurring.filter((item) => recurringActiveIn(item, month) && !paidRecurring.has(item.id))

  const totals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>()
    for (const item of monthExpenses) map.set(item.category, (map.get(item.category) ?? 0) + Number(item.amount))
    for (const item of monthRecurring) map.set(item.category, (map.get(item.category) ?? 0) + Number(item.amount))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [monthExpenses, monthRecurring])

  // O DAS pago neste mês é o imposto do mês anterior.
  const taxNoted = monthExpenses.some((item) => item.category === 'imposto')

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setCategory(preset.category)
    setDescription(preset.description)
    setFormKey((key) => key + 1)
    setError('')
  }

  async function send(url: string, method: string, body: unknown) {
    setSaving(true)
    setError('')
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    setSaving(false)
    if (!response.ok) {
      setError(result.error || 'Não foi possível salvar.')
      return false
    }
    router.refresh()
    return true
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const ok = await send('/api/finance/expenses', 'POST', {
      spentAt: form.get('spentAt'),
      amount: form.get('amount'),
      category,
      channel: form.get('channel'),
      description,
    })
    if (ok) {
      setFormKey((key) => key + 1)
      const spent = String(form.get('spentAt') || '')
      if (spent) setMonth(spent.slice(0, 7))
    }
  }

  async function removeExpense(item: PanelExpense) {
    if (!confirm(`Apagar "${item.description || EXPENSE_CATEGORY_LABELS[item.category]}" de ${money(Number(item.amount), 2)}?`)) return
    await send('/api/finance/expenses', 'DELETE', { id: item.id })
  }

  async function saveRecurring(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const ok = await send('/api/finance/recurring', 'POST', {
      name: form.get('name'),
      amount: form.get('amount'),
      category: form.get('category'),
      channel: form.get('channel'),
      startsOn: `${form.get('startsOn')}-01`,
    })
    if (ok) setRecurringOpen(false)
  }

  async function endRecurring(item: PanelRecurring) {
    const last = shiftMonth(thisMonth, -1)
    if (!confirm(`Parar de contar "${item.name}"? Ele deixa de entrar a partir de ${monthName(thisMonth)}.`)) return
    // Ainda nem começou a contar: só apaga.
    if (monthOf(item.starts_on) > last) {
      await send('/api/finance/recurring', 'DELETE', { id: item.id })
      return
    }
    const [year, m] = last.split('-').map(Number)
    const lastDay = new Date(year, m, 0).getDate()
    await send('/api/finance/recurring', 'PATCH', { id: item.id, endsOn: `${last}-${String(lastDay).padStart(2, '0')}` })
  }

  const channelLocked = defaultChannelFor(category) !== null || NO_CHANNEL.has(category)
  const activeRecurring = recurring.filter((item) => !item.ends_on || monthOf(item.ends_on) >= thisMonth)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {/* Gastos do mês */}
        <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/45">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 className="font-semibold text-ink-100">Gastos de {monthName(month)}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth((current) => shiftMonth(current, -1))}
                className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMonth((current) => shiftMonth(current, 1))}
                disabled={month >= thisMonth}
                className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!taxNoted && (
            <p className="mx-5 mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
              DAS referente a {monthName(shiftMonth(month, -1)).split(' ')[0].toLowerCase()} ainda não anotado neste mês.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[620px] text-left text-sm">
              <thead className="border-y border-ink-800 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Dia</th>
                  <th className="px-5 py-3 font-medium">O que foi</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/80">
                {monthRecurring.map((item) => (
                  <tr key={`fixo-${item.id}`} className="text-ink-400">
                    <td className="px-5 py-3 text-xs text-ink-600">fixo</td>
                    <td className="px-5 py-3">{item.name}</td>
                    <td className="px-5 py-3 text-xs">{EXPENSE_CATEGORY_LABELS[item.category]}</td>
                    <td className="px-5 py-3 text-right tabular">{money(Number(item.amount), 2)}</td>
                    <td className="px-5 py-3 text-right text-[11px] text-ink-600">conta sozinho</td>
                  </tr>
                ))}
                {monthExpenses.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3 tabular text-ink-400">{shortDate(item.spent_at)}</td>
                    <td className="px-5 py-3 text-ink-200">
                      {item.description || EXPENSE_CATEGORY_LABELS[item.category]}
                      {item.channel && item.category !== 'anuncios' && (
                        <span className="ml-2 text-xs text-ink-500">· {CHANNEL_LABELS[item.channel]}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-400">
                      {EXPENSE_CATEGORY_LABELS[item.category]}
                      {(item.category === 'retirada' || item.category === 'salario' || item.category === 'imposto') && (
                        <span className="block text-[11px] text-ink-600">
                          referente a {monthName(shiftMonth(monthOf(item.spent_at), -1), 'short').toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular text-ink-200">{money(Number(item.amount), 2)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeExpense(item)}
                        disabled={saving}
                        className="text-xs text-ink-500 transition hover:text-red-300"
                      >
                        Apagar
                      </button>
                    </td>
                  </tr>
                ))}
                {monthExpenses.length === 0 && monthRecurring.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-ink-600">
                      Nenhum gasto neste mês.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totals.length > 0 && (
            <div className="grid gap-x-6 gap-y-1.5 border-t border-ink-800 px-5 py-4 text-xs sm:grid-cols-2">
              {totals.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <span className="text-ink-500">{EXPENSE_CATEGORY_LABELS[key]}</span>
                  <span className="tabular text-ink-300">{money(value, 2)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-6">
        {/* Anotar gasto */}
        <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
          <h2 className="font-semibold text-ink-100">Anotar gasto</h2>
          <p className="mt-1 text-xs text-ink-500">
            Comissão do SDR e gastos fixos entram sozinhos: não precisa anotar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  category === preset.category
                    ? 'border-auron-500/60 bg-auron-500/15 text-auron-200'
                    : 'border-ink-700 text-ink-300 hover:bg-ink-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form key={formKey} onSubmit={saveExpense} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-ink-500">
                <span className="mb-1 block">Dia</span>
                <input name="spentAt" type="date" required defaultValue={today()} className={inputClass} />
              </label>
              <label className="text-xs text-ink-500">
                <span className="mb-1 block">Valor</span>
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="R$ 0,00" className={inputClass} />
              </label>
            </div>
            <label className="block text-xs text-ink-500">
              <span className="mb-1 block">Tipo</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                className={inputClass}
              >
                {EXPENSE_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {EXPENSE_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            {!channelLocked && (
              <label className="block text-xs text-ink-500">
                <span className="mb-1 block">É de algum processo?</span>
                <select name="channel" defaultValue="" className={inputClass}>
                  <option value="">Não, é custo geral da empresa</option>
                  {FINANCE_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {CHANNEL_LABELS[channel]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {category === 'anuncios' && <p className="text-xs text-ink-500">Entra como investimento do tráfego pago.</p>}
            {category === 'imposto' && (
              <p className="text-xs text-ink-500">O DAS pago neste mês conta como imposto do mês anterior.</p>
            )}
            {category === 'retirada' && (
              <p className="text-xs text-ink-500">A retirada do dia 10 conta no lucro do mês anterior.</p>
            )}
            {category === 'salario' && (
              <p className="text-xs text-amber-200">
                Conta no mês anterior. Se esse salário já está em Gastos fixos, não anote: ele já conta sozinho.
              </p>
            )}
            <label className="block text-xs text-ink-500">
              <span className="mb-1 block">Descrição</span>
              <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              disabled={saving}
              className="w-full rounded-lg bg-auron-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-auron-500 disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Anotar'}
            </button>
          </form>
        </section>

        {/* Gastos fixos */}
        <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink-100">Gastos fixos</h2>
            <button
              type="button"
              onClick={() => setRecurringOpen((open) => !open)}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800"
            >
              {recurringOpen ? 'Fechar' : '+ Novo fixo'}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">Contam sozinhos todo mês. Se o valor mudar, encerre o antigo e cadastre o novo.</p>

          {recurringOpen && (
            <form onSubmit={saveRecurring} className="mt-4 space-y-3 rounded-xl border border-ink-800 bg-ink-950/50 p-3">
              <input name="name" required placeholder="Nome (ex.: Hostinger)" className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Valor por mês" className={inputClass} />
                <input name="startsOn" type="month" required defaultValue={thisMonth} className={inputClass} />
              </div>
              <select name="category" defaultValue="ferramentas" className={inputClass}>
                {RECURRING_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {EXPENSE_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
              <select name="channel" defaultValue="" className={inputClass}>
                <option value="">Custo geral da empresa</option>
                {FINANCE_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    Do processo {CHANNEL_LABELS[channel]}
                  </option>
                ))}
              </select>
              <button
                disabled={saving}
                className="w-full rounded-lg bg-auron-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-auron-500 disabled:opacity-60"
              >
                Salvar gasto fixo
              </button>
            </form>
          )}

          <ul className="mt-4 divide-y divide-ink-800/80 text-sm">
            {activeRecurring.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-ink-200">{item.name}</p>
                  <p className="text-[11px] text-ink-500">
                    {EXPENSE_CATEGORY_LABELS[item.category]} · desde {monthName(monthOf(item.starts_on), 'short')}
                    {item.channel ? ` · ${CHANNEL_LABELS[item.channel]}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-ink-200">{money(Number(item.amount), 2)}</span>
                  <button
                    type="button"
                    onClick={() => endRecurring(item)}
                    disabled={saving}
                    className="text-xs text-ink-500 transition hover:text-red-300"
                  >
                    Encerrar
                  </button>
                </div>
              </li>
            ))}
            {activeRecurring.length === 0 && <li className="py-4 text-center text-ink-600">Nenhum gasto fixo.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
