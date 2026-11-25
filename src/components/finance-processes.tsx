'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  CHANNEL_LABELS,
  commissionOf,
  currentMonthKey,
  lifetimeByChannel,
  localMonthOf,
  money,
  monthName,
  monthsWithData,
  planGoals,
  shiftMonth,
  summarizeMonth,
  type ChannelMonth,
  type PanelData,
  type PanelLead,
  type PanelMeeting,
} from '@/lib/finance'
import type { TeamMember } from '@/lib/crm'

type Props = {
  data: PanelData
  leads: PanelLead[]
  meetings: PanelMeeting[]
  team: TeamMember[]
  profitGoal: number | null
}

const CHANNEL_HINTS: Record<ChannelMonth['channel'], string> = {
  trafego: 'Recargas da Meta + comissão do SDR nas vendas do tráfego',
  indicacao: 'Prêmio para quem indica (quando houver)',
  prospeccao: 'Comissão do SDR nas vendas que ele prospectou',
  organico: 'Conteúdo, seguidores e o que for do orgânico',
}

function ratio(value: number, base: number) {
  return base > 0 ? value / base : null
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={`mt-1 font-display text-lg font-semibold tabular ${
          tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-ink-100'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] leading-4 text-ink-500">{hint}</p>}
    </div>
  )
}

function Line({ label, value, sign, strong, note, sub }: { label: string; value: number; sign?: '-' | '+'; strong?: boolean; note?: string; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${sub ? 'py-1 pl-4 text-xs' : 'py-2'} ${strong ? 'border-t border-ink-800 pt-3' : ''}`}>
      <span className={strong ? 'font-semibold text-ink-100' : sub ? 'text-ink-500' : 'text-ink-400'}>
        {label}
        {note && <span className="ml-2 text-xs text-amber-300">{note}</span>}
      </span>
      <span
        className={`tabular ${
          strong ? (value >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300') : 'text-ink-200'
        }`}
      >
        {sign === '-' && value > 0 ? '− ' : ''}
        {money(value, 2)}
      </span>
    </div>
  )
}

export function FinanceProcesses({ data, leads, meetings, team, profitGoal }: Props) {
  const router = useRouter()
  const thisMonth = currentMonthKey()
  const months = useMemo(() => monthsWithData(data, thisMonth), [data, thisMonth])
  const [month, setMonth] = useState(thisMonth)
  const [goalDraft, setGoalDraft] = useState(profitGoal ? String(profitGoal) : '')
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalError, setGoalError] = useState('')

  const summary = useMemo(() => summarizeMonth(data, month), [data, month])
  const history = useMemo(() => months.map((key) => summarizeMonth(data, key)).reverse(), [data, months])
  const lifetime = useMemo(() => lifetimeByChannel(data, months), [data, months])
  const plan = useMemo(() => planGoals(data, profitGoal, thisMonth), [data, profitGoal, thisMonth])

  const traffic = summary.channels.find((row) => row.channel === 'trafego')!
  // Retorno do mês = o que os clientes NOVOS já pagaram ÷ o que foi investido para trazê-los.
  const trafficReturn = ratio(traffic.newRevenue, traffic.investment)
  const positive = summary.profit >= 0
  const visibleChannels = summary.channels.filter(
    (row) => row.channel === 'trafego' || row.revenue > 0 || row.investment > 0 || row.newClients.length > 0 || lifetime.some((item) => item.channel === row.channel && item.clients > 0)
  )

  // SDR no mês: leads com ele, reuniões que marcou, vendas e comissão.
  const sdrs = team.filter((member) => member.role === 'sdr')
  const sdrRows = sdrs
    .map((member) => {
    const ownLeads = leads.filter((lead) => lead.sdr_id === member.user_id && localMonthOf(lead.created_at) === month)
    const ownMeetings = meetings.filter((item) => item.user_id === member.user_id && localMonthOf(item.created_at) === month)
    const ownSales = data.sales.filter((sale) => sale.sdr_id === member.user_id && sale.won_at && localMonthOf(sale.won_at) === month)
    const sold = ownSales.reduce((sum, sale) => sum + Number(sale.sale_value ?? 0), 0)
    const commission = ownSales.reduce((sum, sale) => sum + commissionOf(sale), 0)
    return {
      member,
      leads: ownLeads.length,
      meetings: ownMeetings.length,
      sales: ownSales,
      sold,
      commission,
      conversion: ratio(ownSales.length, ownLeads.length),
    }
    })
    // Só quem teve movimento no mês (a conta de teste fica de fora).
    .filter((row) => row.leads + row.meetings + row.sales.length > 0)

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingGoal(true)
    setGoalError('')
    const response = await fetch('/api/finance/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profitGoal: goalDraft }),
    })
    const result = await response.json()
    setSavingGoal(false)
    if (!response.ok) {
      setGoalError(result.error || 'Não foi possível salvar a meta.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Mês */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
            disabled={month <= months[0]}
            className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm font-medium text-ink-100 outline-none"
          >
            {[...months].reverse().map((key) => (
              <option key={key} value={key}>
                {monthName(key)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
            disabled={month >= thisMonth}
            className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {month === thisMonth && <span className="text-xs text-ink-500">mês em andamento</span>}
        </div>

        <span
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
            positive
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {positive ? 'Mês no azul' : 'Mês no vermelho'} · lucro {money(summary.profit)}
        </span>
      </div>

      {!summary.taxNoted && !summary.taxNotDue && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
          {summary.taxPending
            ? `O imposto de ${monthName(month)} é pago em ${monthName(shiftMonth(month, 1)).split(' ')[0].toLowerCase()}: até lá o lucro abaixo está sem imposto. Quando pagar o DAS, anote em Gastos.`
            : `Imposto de ${monthName(month)} não anotado: o lucro abaixo está sem imposto.`}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Resultado do mês */}
        <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
          <h2 className="font-semibold text-ink-100">Resultado de {monthName(month)}</h2>
          <div className="mt-3 text-sm">
            <Line label="Receita (o que entrou dos clientes)" value={summary.revenue} />
            <Line sub label="Clientes novos do mês" value={summary.newRevenue} />
            <Line sub label="Recorrência (clientes de meses anteriores)" value={summary.recurringRevenue} />
            <Line label="Investimento nos processos" value={summary.investment} sign="-" />
            <Line label="Custos fixos" value={summary.fixed} sign="-" />
            <Line
              label={summary.taxNoted ? `Imposto (DAS pago em ${monthName(shiftMonth(month, 1)).split(' ')[0].toLowerCase()})` : 'Imposto'}
              value={summary.tax}
              sign="-"
              note={summary.taxNoted || summary.taxNotDue ? undefined : summary.taxPending ? 'pago no mês seguinte' : 'não anotado'}
            />
            <Line label="Lucro do mês" value={summary.profit} strong />
            {summary.withdrawalsPending ? (
              <div className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-ink-400">Retirada dos sócios</span>
                <span className="text-xs text-ink-500">dia 10 de {monthName(shiftMonth(month, 1)).split(' ')[0].toLowerCase()}</span>
              </div>
            ) : (
              <Line label={`Retirada dos sócios (feita em 10/${shiftMonth(month, 1).slice(5)})`} value={summary.withdrawals} sign="-" />
            )}
            {summary.reserve > 0 && <Line label="Guardado na reserva" value={summary.reserve} sign="-" />}
            {summary.refunds > 0 && <Line label="Devolvido a cliente" value={summary.refunds} sign="-" />}
            <Line label={summary.withdrawalsPending ? 'Disponível para a retirada' : 'Sobrou no caixa'} value={summary.cash} strong />
          </div>

          {summary.fixedItems.length > 0 && (
            <details className="mt-3 text-xs text-ink-500">
              <summary className="cursor-pointer text-ink-400 hover:text-ink-200">Ver custos fixos do mês</summary>
              <ul className="mt-2 space-y-1">
                {summary.fixedItems.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="flex justify-between gap-3">
                    <span>
                      {item.label}
                      {item.recurring && <span className="ml-1 text-ink-600">(fixo cadastrado)</span>}
                    </span>
                    <span className="tabular text-ink-300">{money(item.amount, 2)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {summary.unassignedRevenue > 0 && (
            <p className="mt-3 text-xs text-amber-300">
              {money(summary.unassignedRevenue, 2)} de receita veio de cliente sem processo definido.
            </p>
          )}
        </section>

        {/* Tráfego se paga? */}
        <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
          <h2 className="font-semibold text-ink-100">O tráfego pago está se pagando?</h2>
          <p className="mt-1 text-xs text-ink-500">
            Investimento = recargas da Meta anotadas + comissão do SDR nas vendas do tráfego.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Stat label="Investido no mês" value={money(traffic.investment)} hint={`Meta ${money(traffic.ads)} · comissão ${money(traffic.commission)}`} />
            <Stat label="Clientes novos" value={String(traffic.newClients.length)} hint={traffic.newClients.join(', ') || 'nenhum no mês'} />
            <Stat label="CAC (custo por cliente)" value={money(traffic.cac)} />
            <Stat
              label="Entrou dos clientes novos"
              value={money(traffic.newRevenue)}
              hint={`1º pagamento dos ${traffic.newClients.length} que entraram no mês`}
            />
            <Stat
              label="Cada R$ 1 investido voltou"
              value={trafficReturn === null ? '—' : `R$ ${trafficReturn.toFixed(2).replace('.', ',')}`}
              tone={trafficReturn === null ? undefined : trafficReturn >= 1 ? 'good' : 'bad'}
              hint="só com os novos, no 1º mês; cresce a cada mês que eles ficam"
            />
            <Stat
              label="Recorrência do tráfego"
              value={money(traffic.recurringRevenue)}
              hint={`${traffic.recurringClients} clientes de meses anteriores pagaram`}
            />
            <Stat
              label="Resultado do tráfego"
              value={money(traffic.result)}
              tone={traffic.result >= 0 ? 'good' : 'bad'}
            />
          </div>
          {(() => {
            const life = lifetime.find((row) => row.channel === 'trafego')
            if (!life || !life.cac || !life.ltv) return null
            return (
              <p className="mt-4 rounded-lg bg-ink-950/60 px-3 py-2.5 text-sm text-ink-300">
                Desde o começo: cada cliente do tráfego custou em média <strong className="text-ink-100">{money(life.cac)}</strong> e
                pagou <strong className="text-ink-100">{money(life.ltv)}</strong> enquanto ficou ({life.avgMonths?.toFixed(1).replace('.', ',')} meses).
                Cada R$ 1 investido voltou <strong className={life.ltvToCac && life.ltvToCac >= 1 ? 'text-emerald-300' : 'text-red-300'}>R$ {life.ltvToCac?.toFixed(2).replace('.', ',')}</strong>.
              </p>
            )
          })()}
        </section>
      </div>

      {/* Processos no mês */}
      <section>
        <h2 className="mb-3 font-semibold text-ink-100">Processos em {monthName(month)}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visibleChannels.map((row) => (
            <div key={row.channel} className="rounded-2xl border border-ink-800 bg-ink-900/45 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-100">{CHANNEL_LABELS[row.channel]}</h3>
                <span className={`text-sm font-semibold tabular ${row.result >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {money(row.result)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-500">{CHANNEL_HINTS[row.channel]}</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Entrou dos novos</dt><dd className="tabular text-ink-200">{money(row.newRevenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Recorrência</dt><dd className="tabular text-ink-200">{money(row.recurringRevenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Investimento</dt><dd className="tabular text-ink-200">{money(row.investment)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Clientes novos</dt><dd className="tabular text-ink-200">{row.newClients.length}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">CAC</dt><dd className="tabular text-ink-200">{row.newClients.length ? money(row.cac) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Pagaram no mês</dt><dd className="tabular text-ink-200">{row.payingClients}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Saíram</dt><dd className={`tabular ${row.churned.length ? 'text-red-300' : 'text-ink-200'}`}>{row.churned.length}</dd></div>
              </dl>
              {(row.newClients.length > 0 || row.churned.length > 0) && (
                <div className="mt-3 space-y-1 text-[11px] leading-4 text-ink-500">
                  {row.newClients.length > 0 && <p><span className="text-emerald-300">Entraram:</span> {row.newClients.join(', ')}</p>}
                  {row.churned.length > 0 && <p><span className="text-red-300">Saíram:</span> {row.churned.join(', ')}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SDR */}
      <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
        <h2 className="font-semibold text-ink-100">SDR em {monthName(month)}</h2>
        <p className="mt-1 text-xs text-ink-500">
          Comissão: 10% da 1ª mensalidade em cliente que ele prospectou, 5% em cliente do tráfego. Calculada pelas vendas do CRM, não precisa anotar.
        </p>
        {sdrRows.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">Nenhum movimento de SDR neste mês.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {sdrRows.map((row) => (
              <div key={row.member.user_id} className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="SDR" value={row.member.name} />
                <Stat label="Leads com ele" value={String(row.leads)} hint="leads que entraram no mês com ele" />
                <Stat label="Reuniões marcadas" value={String(row.meetings)} />
                <Stat label="Vendas" value={String(row.sales.length)} hint={row.sales.map((sale) => sale.name).join(', ') || undefined} />
                <Stat label="Conversão" value={row.conversion === null ? '—' : `${(row.conversion * 100).toFixed(1).replace('.', ',')}%`} hint="vendas ÷ leads do mês" />
                <Stat label="Comissão" value={money(row.commission, 2)} hint={`sobre ${money(row.sold)} em 1ª mensalidade`} />
              </div>
            ))}
          </div>
        )}
        {(summary.team > 0 || sdrRows.length > 0) && (() => {
          const commission = sdrRows.reduce((sum, row) => sum + row.commission, 0)
          const sales = sdrRows.reduce((sum, row) => sum + row.sales.length, 0)
          const total = summary.team + commission
          return (
            <p className="mt-5 rounded-lg bg-ink-950/60 px-3 py-2.5 text-sm text-ink-300">
              Custo do SDR no mês: fixo <strong className="text-ink-100">{money(summary.team, 2)}</strong> + comissão{' '}
              <strong className="text-ink-100">{money(commission, 2)}</strong> ={' '}
              <strong className="text-ink-100">{money(total, 2)}</strong>
              {sales > 0 ? (
                <> · <strong className="text-ink-100">{money(total / sales)}</strong> por venda fechada</>
              ) : (
                ' · nenhuma venda no mês'
              )}
              . O fixo entra nos custos fixos da empresa (pago todo dia 5, referente ao mês anterior).
            </p>
          )
        })()}
      </section>

      {/* Metas */}
      <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink-100">Metas</h2>
            <p className="mt-1 max-w-2xl text-xs text-ink-500">
              Custos = média dos últimos 3 meses (fixos + imposto anotado + investimento nos processos), já com o fixo atual do SDR. Ticket = mensalidade média dos clientes ativos.
            </p>
          </div>
          <form onSubmit={saveGoal} className="flex items-end gap-2">
            <label className="text-xs text-ink-500">
              <span className="mb-1 block">Lucro que vocês querem por mês</span>
              <input
                type="number"
                min="0"
                step="100"
                value={goalDraft}
                onChange={(event) => setGoalDraft(event.target.value)}
                placeholder="R$ 0"
                className="w-40 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-auron-500"
              />
            </label>
            <button
              disabled={savingGoal}
              className="rounded-lg bg-auron-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-auron-500 disabled:opacity-60"
            >
              {savingGoal ? 'Salvando...' : 'Salvar meta'}
            </button>
          </form>
        </div>
        {goalError && <p className="mt-2 text-sm text-red-400">{goalError}</p>}

        <div className="mt-5 grid grid-cols-2 gap-5 md:grid-cols-4">
          <Stat label="Clientes ativos hoje" value={String(plan.activeClients)} hint={`${money(plan.recurringRevenue)} por mês`} />
          <Stat label="Ticket médio" value={money(plan.ticket)} />
          <Stat label="Custos médios por mês" value={money(plan.avgFixed + plan.avgInvestment)} hint={`fixos + equipe + imposto ${money(plan.avgFixed)} · processos ${money(plan.avgInvestment)}`} />
          <Stat
            label="Para pagar todos os custos"
            value={plan.breakEvenClients === null ? '—' : `${plan.breakEvenClients} clientes`}
            tone={plan.breakEvenClients !== null && plan.activeClients >= plan.breakEvenClients ? 'good' : 'bad'}
          />
        </div>

        {profitGoal ? (
          <div className="mt-5 grid grid-cols-2 gap-5 border-t border-ink-800 pt-5 md:grid-cols-4">
            <Stat label={`Para lucrar ${money(profitGoal)}`} value={plan.goalClients === null ? '—' : `${plan.goalClients} clientes ativos`} />
            <Stat
              label="Faltam"
              value={plan.missingClients === null ? '—' : `${plan.missingClients} clientes`}
              tone={plan.missingClients === 0 ? 'good' : undefined}
            />
            <Stat
              label="Fechar por mês"
              value={plan.newPerMonth === null ? '—' : `${plan.newPerMonth} clientes`}
              hint={`repor ~${plan.avgChurn.toFixed(1).replace('.', ',')} que saem por mês + chegar na meta em 3 meses`}
            />
            <Stat label="Investimento no tráfego" value={money(plan.trafficBudget)} hint={`se vierem do tráfego, CAC ${money(plan.trafficCac)}`} />
          </div>
        ) : (
          <p className="mt-5 border-t border-ink-800 pt-4 text-sm text-ink-500">
            Coloque o lucro que vocês querem por mês para ver quantos clientes faltam e quanto investir.
          </p>
        )}
      </section>

      {/* Desde o começo */}
      <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/45">
        <div className="px-5 pt-5">
          <h2 className="font-semibold text-ink-100">Cada processo desde o começo</h2>
          <p className="mt-1 text-xs text-ink-500">Desde {monthName(months[0])}. Conta também quem já saiu.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[760px] text-left text-sm">
            <thead className="border-y border-ink-800 text-xs uppercase tracking-wide text-ink-600">
              <tr>
                <th className="px-5 py-3 font-medium">Processo</th>
                <th className="px-5 py-3 text-right font-medium">Clientes</th>
                <th className="px-5 py-3 text-right font-medium">Ativos</th>
                <th className="px-5 py-3 text-right font-medium">Receita</th>
                <th className="px-5 py-3 text-right font-medium">Investido</th>
                <th className="px-5 py-3 text-right font-medium">CAC</th>
                <th className="px-5 py-3 text-right font-medium">Pagou em média</th>
                <th className="px-5 py-3 text-right font-medium">Fica (meses)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/80">
              {lifetime.map((row) => (
                <tr key={row.channel}>
                  <td className="px-5 py-3 font-medium text-ink-200">{CHANNEL_LABELS[row.channel]}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{row.clients}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{row.active}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(row.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(row.investment)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{row.clients === 0 ? '—' : row.cac ? money(row.cac) : 'R$ 0'}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(row.ltv)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{row.avgMonths?.toFixed(1).replace('.', ',') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mês a mês */}
      <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/45">
        <div className="px-5 pt-5">
          <h2 className="font-semibold text-ink-100">Mês a mês</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[1040px] text-left text-sm">
            <thead className="border-y border-ink-800 text-xs uppercase tracking-wide text-ink-600">
              <tr>
                <th className="px-5 py-3 font-medium">Mês</th>
                <th className="px-5 py-3 text-right font-medium">Novos (R$)</th>
                <th className="px-5 py-3 text-right font-medium">Recorrência</th>
                <th className="px-5 py-3 text-right font-medium">Receita total</th>
                <th className="px-5 py-3 text-right font-medium">Processos</th>
                <th className="px-5 py-3 text-right font-medium">Fixos</th>
                <th className="px-5 py-3 text-right font-medium">Imposto</th>
                <th className="px-5 py-3 text-right font-medium">Lucro</th>
                <th className="px-5 py-3 text-right font-medium" title="Feita no dia 10 do mês seguinte">Retirada</th>
                <th className="px-5 py-3 text-right font-medium">Caixa</th>
                <th className="px-5 py-3 text-right font-medium">Novos</th>
                <th className="px-5 py-3 text-right font-medium">Saíram</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/80">
              {history.map((item) => (
                <tr
                  key={item.month}
                  onClick={() => setMonth(item.month)}
                  className={`cursor-pointer transition hover:bg-ink-900/80 ${item.month === month ? 'bg-ink-900/70' : ''}`}
                >
                  <td className="px-5 py-3 font-medium text-ink-200">{monthName(item.month)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(item.newRevenue)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(item.recurringRevenue)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-200">{money(item.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(item.investment)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{money(item.fixed)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">
                    {item.taxNoted ? (
                      money(item.tax)
                    ) : item.taxNotDue ? (
                      <span className="text-ink-500">—</span>
                    ) : item.taxPending ? (
                      <span className="text-xs text-ink-500">mês seguinte</span>
                    ) : (
                      <span className="text-amber-300">não anotado</span>
                    )}
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold tabular ${item.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {money(item.profit)}
                  </td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">
                    {item.withdrawalsPending ? <span className="text-xs text-ink-500">dia 10</span> : money(item.withdrawals)}
                  </td>
                  <td className={`px-5 py-3 text-right tabular ${item.cash >= 0 ? 'text-ink-300' : 'text-red-300'}`}>{money(item.cash)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{item.channels.reduce((n, row) => n + row.newClients.length, 0)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-300">{item.channels.reduce((n, row) => n + row.churned.length, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
