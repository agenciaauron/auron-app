'use client'

import { useMemo, useState } from 'react'
import {
  COMMISSION_RATES,
  ORIGIN_LABELS,
  formatCurrency,
  isManager,
  normalizeOrigin,
  type TeamMember,
} from '@/lib/crm'

type Sale = {
  id: string
  name: string
  origin: string | null
  sdr_id: string | null
  sale_value: number | string | null
  won_at: string | null
}

type MeetingActivity = {
  user_id: string | null
  type: string
  created_at: string
}

type Props = {
  userId: string
  role: string
  sales: Sale[]
  meetings: MeetingActivity[]
  team: TeamMember[]
}

function monthKey(value: string | number | Date) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function CommissionsWorkspace({ userId, role, sales, meetings, team }: Props) {
  const manager = isManager(role)
  const [currentMonth] = useState(() => monthKey(Date.now()))
  const [month, setMonth] = useState(currentMonth)
  const [sdrFilter, setSdrFilter] = useState(manager ? 'all' : userId)

  const sdrs = team.filter((member) => member.role === 'sdr')
  const nameOf = (id: string | null) => team.find((member) => member.user_id === id)?.name ?? 'Sem SDR'

  const months = useMemo(() => {
    const keys = new Set<string>([currentMonth])
    sales.forEach((sale) => sale.won_at && keys.add(monthKey(sale.won_at)))
    return Array.from(keys).sort().reverse()
  }, [sales, currentMonth])

  const rows = useMemo(
    () =>
      sales
        .filter((sale) => sale.won_at && monthKey(sale.won_at) === month)
        .filter((sale) => (sdrFilter === 'all' ? true : sale.sdr_id === sdrFilter))
        .map((sale) => {
          const origin = normalizeOrigin(sale.origin)
          const value = Number(sale.sale_value ?? 0)
          const rate = sale.sdr_id ? COMMISSION_RATES[origin] : 0
          return { ...sale, origin, value, rate, commission: value * rate }
        })
        .sort((a, b) => new Date(b.won_at!).getTime() - new Date(a.won_at!).getTime()),
    [sales, month, sdrFilter]
  )

  const withSdr = rows.filter((row) => row.sdr_id)
  const withoutSdr = rows.filter((row) => !row.sdr_id)
  const total = withSdr.reduce((sum, row) => sum + row.commission, 0)
  const missingValue = withSdr.filter((row) => !row.value).length

  const meetingStats = useMemo(() => {
    const inMonth = meetings.filter(
      (item) =>
        monthKey(item.created_at) === month &&
        (sdrFilter === 'all' ? true : item.user_id === sdrFilter)
    )
    return {
      booked: inMonth.filter((item) => item.type === 'reuniao_marcada').length,
      done: inMonth.filter((item) => item.type === 'reuniao_realizada').length,
    }
  }, [meetings, month, sdrFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-500">
          <span className="mb-1 block">Mês da venda</span>
          <select
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-sm text-ink-300 outline-none"
          >
            {months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </label>

        {manager && (
          <label className="text-xs text-ink-500">
            <span className="mb-1 block">SDR</span>
            <select
              value={sdrFilter}
              onChange={(event) => setSdrFilter(event.target.value)}
              className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-sm text-ink-300 outline-none"
            >
              <option value="all">Todos</option>
              {sdrs.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-xs uppercase tracking-wider text-ink-500">Comissão do mês</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular text-emerald-300">{formatCurrency(total)}</p>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
          <p className="text-xs uppercase tracking-wider text-ink-500">Vendas com comissão</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular text-ink-50">{withSdr.length}</p>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
          <p className="text-xs uppercase tracking-wider text-ink-500">Reuniões marcadas</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular text-ink-50">{meetingStats.booked}</p>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
          <p className="text-xs uppercase tracking-wider text-ink-500">Reuniões que aconteceram</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular text-ink-50">{meetingStats.done}</p>
        </div>
      </div>

      <p className="text-xs text-ink-500">
        Regra: {Math.round(COMMISSION_RATES.prospeccao * 100)}% da 1ª mensalidade em cliente que o SDR prospectou e{' '}
        {Math.round(COMMISSION_RATES.trafego * 100)}% em cliente que veio do tráfego. A 1ª mensalidade é o valor da venda
        informado na ficha do lead.
      </p>

      {missingValue > 0 && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          {missingValue} venda(s) sem valor informado. A comissão delas aparece como R$ 0 até o valor ser preenchido.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-ink-800 bg-ink-900/45">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-600">
            <tr>
              <th className="px-5 py-4 font-medium">Cliente</th>
              {manager && <th className="px-5 py-4 font-medium">SDR</th>}
              <th className="px-5 py-4 font-medium">Frente</th>
              <th className="px-5 py-4 font-medium">Data da venda</th>
              <th className="px-5 py-4 font-medium">1ª mensalidade</th>
              <th className="px-5 py-4 font-medium">%</th>
              <th className="px-5 py-4 font-medium">Comissão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800/80">
            {withSdr.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-4 font-medium text-ink-200">{row.name}</td>
                {manager && <td className="px-5 py-4 text-ink-400">{nameOf(row.sdr_id)}</td>}
                <td className="px-5 py-4 text-ink-400">{ORIGIN_LABELS[row.origin]}</td>
                <td className="px-5 py-4 text-ink-400">{new Date(row.won_at!).toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-4 text-ink-300">{formatCurrency(row.value)}</td>
                <td className="px-5 py-4 text-ink-400">{Math.round(row.rate * 100)}%</td>
                <td className="px-5 py-4 font-semibold text-emerald-300">{formatCurrency(row.commission)}</td>
              </tr>
            ))}
            {withSdr.length === 0 && (
              <tr>
                <td colSpan={manager ? 7 : 6} className="px-5 py-12 text-center text-ink-600">
                  Nenhuma venda com comissão nesse mês.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {manager && withoutSdr.length > 0 && (
        <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-5">
          <p className="text-sm font-medium text-ink-200">Vendas do mês sem SDR ({withoutSdr.length})</p>
          <p className="mt-1 text-xs text-ink-500">
            Não geram comissão. Se algum SDR trabalhou o lead, abra a ficha e escolha o SDR responsável.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-ink-400">
            {withoutSdr.map((row) => (
              <li key={row.id}>
                {row.name} · {ORIGIN_LABELS[row.origin]} · {formatCurrency(row.value)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
