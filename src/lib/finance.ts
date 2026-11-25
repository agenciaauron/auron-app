// Financeiro por processo (pedido do Rafael, 25/11/2026).
// Regras combinadas com ele:
// * Receita = pagamentos registrados (o que está no CRM foi pago), no mês em que o dinheiro entrou.
// * Custo do tráfego = recargas da Meta anotadas (o que sai do banco, já com o imposto da Meta).
// * Comissão do SDR = calculada pelas vendas do CRM: % da 1ª mensalidade, no mês da venda. Não se anota à mão.
// * Imposto = só o que for anotado. Sem anotação, conta zero e o painel avisa.
//   O DAS pago num mês é referente ao faturamento do mês ANTERIOR: o de 16/11 é imposto de outubro.
// * Gastos fixos cadastrados contam todo mês sozinhos (a partir do início de cada um).
// * Retirada dos sócios e reserva não são custo: aparecem depois do lucro.
// * A retirada é feita todo dia 10 e é referente ao mês ANTERIOR: a retirada de 10/11 sai do lucro de outubro.
// * Salário/fixo da equipe também é referente ao mês anterior (fixo do SDR é pago todo dia 5).

import { COMMISSION_RATES, normalizeOrigin } from '@/lib/crm'

export type FinanceChannel = 'trafego' | 'indicacao' | 'prospeccao' | 'organico'

export const FINANCE_CHANNELS: FinanceChannel[] = ['trafego', 'indicacao', 'prospeccao', 'organico']

export const CHANNEL_LABELS: Record<FinanceChannel, string> = {
  trafego: 'Tráfego pago',
  indicacao: 'Indicação',
  prospeccao: 'Prospecção ativa',
  organico: 'Orgânico',
}

export function isFinanceChannel(value: unknown): value is FinanceChannel {
  return typeof value === 'string' && (FINANCE_CHANNELS as string[]).includes(value)
}

export type ExpenseCategory =
  | 'anuncios'
  | 'marketing'
  | 'ferramentas'
  | 'contador'
  | 'imposto'
  | 'combustivel'
  | 'transporte'
  | 'outros'
  | 'salario'
  | 'retirada'
  | 'reserva'
  | 'devolucao'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  anuncios: 'Recarga Meta (anúncios)',
  marketing: 'Marketing (conteúdo, seguidores...)',
  ferramentas: 'Ferramentas e assinaturas',
  contador: 'Contabilidade',
  imposto: 'Imposto',
  combustivel: 'Combustível',
  transporte: 'Transporte e pedágio',
  outros: 'Outros gastos',
  salario: 'Salário / fixo da equipe',
  retirada: 'Retirada dos sócios',
  reserva: 'Reserva (aplicação)',
  devolucao: 'Devolução a cliente',
}

// Ordem do formulário.
export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]

// Não entram no custo da empresa (aparecem depois do lucro, ou à parte).
const NOT_COST = new Set<ExpenseCategory>(['retirada', 'reserva', 'devolucao', 'imposto'])

// Categorias que podem virar gasto fixo.
export const RECURRING_CATEGORIES: ExpenseCategory[] = [
  'salario',
  'ferramentas',
  'contador',
  'marketing',
  'combustivel',
  'transporte',
  'outros',
]

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && value in EXPENSE_CATEGORY_LABELS
}

// Recarga da Meta é sempre custo do tráfego.
export function defaultChannelFor(category: ExpenseCategory): FinanceChannel | null {
  return category === 'anuncios' ? 'trafego' : null
}

export type PanelClient = {
  id: string
  name: string
  status: 'active' | 'paused' | 'cancelled'
  channel: FinanceChannel | null
  monthly_amount: number | string
  billing_cycle: 'monthly' | 'biweekly'
  ended_at: string | null
}

export type PanelPayment = {
  finance_client_id: string
  paid_at: string
  amount: number | string
}

export type PanelExpense = {
  id: string
  spent_at: string
  amount: number | string
  category: ExpenseCategory
  channel: FinanceChannel | null
  description: string | null
  recurring_id: string | null
  source: 'manual' | 'extrato'
}

export type PanelRecurring = {
  id: string
  name: string
  amount: number | string
  category: ExpenseCategory
  channel: FinanceChannel | null
  starts_on: string
  ends_on: string | null
}

export type PanelSale = {
  id: string
  name: string
  origin: string | null
  sdr_id: string | null
  sale_value: number | string | null
  won_at: string | null
}

export type PanelLead = {
  id: string
  sdr_id: string | null
  created_at: string
  won_at: string | null
}

export type PanelMeeting = {
  user_id: string | null
  created_at: string
}

export type PanelData = {
  clients: PanelClient[]
  payments: PanelPayment[]
  expenses: PanelExpense[]
  recurring: PanelRecurring[]
  sales: PanelSale[]
}

// "2026-11" a partir de uma data ISO "2026-11-25" (sem fuso: as datas do financeiro são dias).
export function monthOf(date: string) {
  return date.slice(0, 7)
}

// Mês de um timestamp (vendas, leads), no fuso de quem está vendo.
export function localMonthOf(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonthKey() {
  return localMonthOf(new Date().toISOString())
}

export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthName(month: string, style: 'long' | 'short' = 'long') {
  const [year, m] = month.split('-').map(Number)
  const label = new Intl.DateTimeFormat('pt-BR', { month: style, year: style === 'long' ? 'numeric' : undefined }).format(
    new Date(year, m - 1, 1)
  )
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '')
}

export function monthlyValueOf(client: PanelClient) {
  return Number(client.monthly_amount) * (client.billing_cycle === 'biweekly' ? 2 : 1)
}

// Gasto fixo vale no mês se começou até ele e não terminou antes dele.
export function recurringActiveIn(item: PanelRecurring, month: string) {
  return monthOf(item.starts_on) <= month && (!item.ends_on || monthOf(item.ends_on) >= month)
}

export function commissionOf(sale: PanelSale) {
  if (!sale.sdr_id) return 0
  return Number(sale.sale_value ?? 0) * COMMISSION_RATES[normalizeOrigin(sale.origin)]
}

function channelOfSale(sale: PanelSale): FinanceChannel {
  return normalizeOrigin(sale.origin) === 'prospeccao' ? 'prospeccao' : 'trafego'
}

export type ChannelMonth = {
  channel: FinanceChannel
  revenue: number
  ads: number // recargas da Meta
  marketing: number // outros gastos do processo (conteúdo, seguidores...)
  commission: number // comissão do SDR (calculada)
  investment: number
  newClients: string[]
  payingClients: number
  churned: string[]
  cac: number | null
  result: number
}

export type MonthSummary = {
  month: string
  channels: ChannelMonth[]
  unassignedRevenue: number
  revenue: number
  investment: number
  fixedItems: { label: string; amount: number; recurring: boolean }[]
  fixed: number
  team: number // salário/fixo da equipe (já incluído em fixed)
  tax: number
  taxNoted: boolean
  taxPending: boolean // o imposto deste mês só é pago no mês seguinte, que ainda não chegou
  profit: number
  withdrawals: number // retirada referente a este mês (feita no mês seguinte)
  withdrawalsPending: boolean // a retirada deste mês ainda não aconteceu
  reserve: number
  refunds: number
  cash: number
}

// Primeiro pagamento de cada cliente = mês em que ele virou cliente.
export function firstPaymentByClient(payments: PanelPayment[]) {
  const first = new Map<string, string>()
  for (const payment of payments) {
    const current = first.get(payment.finance_client_id)
    if (!current || payment.paid_at < current) first.set(payment.finance_client_id, payment.paid_at)
  }
  return first
}

export function summarizeMonth(data: PanelData, month: string): MonthSummary {
  const clientById = new Map(data.clients.map((client) => [client.id, client]))
  const firstPayment = firstPaymentByClient(data.payments)

  const channels = new Map<FinanceChannel, ChannelMonth>(
    FINANCE_CHANNELS.map((channel) => [
      channel,
      {
        channel,
        revenue: 0,
        ads: 0,
        marketing: 0,
        commission: 0,
        investment: 0,
        newClients: [],
        payingClients: 0,
        churned: [],
        cac: null,
        result: 0,
      },
    ])
  )

  let unassignedRevenue = 0
  const paying = new Map<FinanceChannel, Set<string>>(FINANCE_CHANNELS.map((channel) => [channel, new Set()]))
  for (const payment of data.payments) {
    if (monthOf(payment.paid_at) !== month) continue
    const client = clientById.get(payment.finance_client_id)
    const amount = Number(payment.amount)
    if (!client?.channel) {
      unassignedRevenue += amount
      continue
    }
    channels.get(client.channel)!.revenue += amount
    paying.get(client.channel)!.add(client.id)
  }

  for (const client of data.clients) {
    if (!client.channel) continue
    const row = channels.get(client.channel)!
    const first = firstPayment.get(client.id)
    if (first && monthOf(first) === month) row.newClients.push(client.name)
    if (client.status === 'cancelled' && client.ended_at && monthOf(client.ended_at) === month) {
      row.churned.push(client.name)
    }
  }

  const fixedItems: MonthSummary['fixedItems'] = []
  // Imposto referente ao mês = DAS pago no mês seguinte.
  const taxExpenses = data.expenses.filter(
    (expense) => expense.category === 'imposto' && monthOf(expense.spent_at) === shiftMonth(month, 1)
  )
  const tax = taxExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
  const taxNoted = taxExpenses.length > 0
  const taxPending = !taxNoted && shiftMonth(month, 1) >= currentMonthKey()
  // Retirada referente ao mês = a que foi feita no mês seguinte (dia 10).
  const nextMonth = shiftMonth(month, 1)
  const withdrawalExpenses = data.expenses.filter(
    (expense) => expense.category === 'retirada' && monthOf(expense.spent_at) === nextMonth
  )
  const withdrawals = withdrawalExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
  const withdrawalsPending = withdrawalExpenses.length === 0 && nextMonth >= currentMonthKey()
  let reserve = 0
  let refunds = 0
  let team = 0
  const recurringPaid = new Set<string>()

  // Salário pago no começo do mês seguinte (dia 5) é custo deste mês.
  for (const expense of data.expenses) {
    if (expense.category !== 'salario' || monthOf(expense.spent_at) !== nextMonth) continue
    if (expense.recurring_id) recurringPaid.add(expense.recurring_id)
    const amount = Number(expense.amount)
    team += amount
    fixedItems.push({ label: expense.description || EXPENSE_CATEGORY_LABELS.salario, amount, recurring: false })
  }

  for (const expense of data.expenses) {
    if (monthOf(expense.spent_at) !== month) continue
    const amount = Number(expense.amount)
    if (expense.recurring_id && expense.category !== 'salario') recurringPaid.add(expense.recurring_id)

    if (expense.category === 'imposto' || expense.category === 'retirada' || expense.category === 'salario') {
      // contam no mês anterior (acima)
    } else if (expense.category === 'reserva') {
      reserve += amount
    } else if (expense.category === 'devolucao') {
      refunds += amount
    } else if (expense.channel) {
      const row = channels.get(expense.channel)!
      if (expense.category === 'anuncios') row.ads += amount
      else row.marketing += amount
    } else if (!NOT_COST.has(expense.category)) {
      fixedItems.push({
        label: expense.description || EXPENSE_CATEGORY_LABELS[expense.category],
        amount,
        recurring: false,
      })
    }
  }

  // Gastos fixos cadastrados: contam sozinhos no mês, a não ser que já tenham sido lançados.
  for (const item of data.recurring) {
    if (!recurringActiveIn(item, month) || recurringPaid.has(item.id)) continue
    const amount = Number(item.amount)
    if (item.category === 'salario') team += amount
    if (item.channel) {
      channels.get(item.channel)!.marketing += amount
    } else {
      fixedItems.push({ label: item.name, amount, recurring: true })
    }
  }

  for (const sale of data.sales) {
    if (!sale.won_at || localMonthOf(sale.won_at) !== month) continue
    const commission = commissionOf(sale)
    if (commission > 0) channels.get(channelOfSale(sale))!.commission += commission
  }

  const rows = FINANCE_CHANNELS.map((channel) => {
    const row = channels.get(channel)!
    row.payingClients = paying.get(channel)!.size
    row.investment = row.ads + row.marketing + row.commission
    row.cac = row.newClients.length > 0 ? row.investment / row.newClients.length : null
    row.result = row.revenue - row.investment
    return row
  })

  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0) + unassignedRevenue
  const investment = rows.reduce((sum, row) => sum + row.investment, 0)
  const fixed = fixedItems.reduce((sum, item) => sum + item.amount, 0)
  const profit = revenue - investment - fixed - tax

  return {
    month,
    channels: rows,
    unassignedRevenue,
    revenue,
    investment,
    fixedItems: fixedItems.sort((a, b) => b.amount - a.amount),
    fixed,
    team,
    tax,
    taxNoted,
    taxPending,
    profit,
    withdrawals,
    withdrawalsPending,
    reserve,
    refunds,
    cash: profit - withdrawals - reserve - refunds,
  }
}

export type ChannelLifetime = {
  channel: FinanceChannel
  clients: number
  active: number
  revenue: number
  ltv: number | null
  avgMonths: number | null
  investment: number
  cac: number | null
  ltvToCac: number | null
}

// Desde o começo: quanto cada cliente pagou, quanto tempo ficou e quanto custou trazer.
export function lifetimeByChannel(data: PanelData, months: string[]): ChannelLifetime[] {
  const clientById = new Map(data.clients.map((client) => [client.id, client]))
  const paidByClient = new Map<string, { total: number; months: Set<string> }>()
  for (const payment of data.payments) {
    const entry = paidByClient.get(payment.finance_client_id) ?? { total: 0, months: new Set<string>() }
    entry.total += Number(payment.amount)
    entry.months.add(monthOf(payment.paid_at))
    paidByClient.set(payment.finance_client_id, entry)
  }

  const investment = new Map<FinanceChannel, number>(FINANCE_CHANNELS.map((channel) => [channel, 0]))
  for (const month of months) {
    for (const row of summarizeMonth(data, month).channels) {
      investment.set(row.channel, investment.get(row.channel)! + row.investment)
    }
  }

  return FINANCE_CHANNELS.map((channel) => {
    const own = data.clients.filter((client) => client.channel === channel && paidByClient.has(client.id))
    const revenue = own.reduce((sum, client) => sum + paidByClient.get(client.id)!.total, 0)
    const monthsPaid = own.reduce((sum, client) => sum + paidByClient.get(client.id)!.months.size, 0)
    const spent = investment.get(channel)!
    const ltv = own.length ? revenue / own.length : null
    const cac = own.length && spent > 0 ? spent / own.length : null
    return {
      channel,
      clients: own.length,
      active: data.clients.filter((client) => client.channel === channel && client.status === 'active').length,
      revenue,
      ltv,
      avgMonths: own.length ? monthsPaid / own.length : null,
      investment: spent,
      cac,
      ltvToCac: ltv !== null && cac ? ltv / cac : null,
    }
  }).filter((row) => row.clients > 0 || row.investment > 0 || clientById.size === 0)
}

// Meses com movimento, do primeiro até o atual.
export function monthsWithData(data: PanelData, upTo = currentMonthKey()) {
  const dates = [
    ...data.payments.map((payment) => payment.paid_at),
    ...data.expenses.map((expense) => expense.spent_at),
  ].sort()
  if (!dates.length) return [upTo]
  const months: string[] = []
  for (let month = monthOf(dates[0]); month <= upTo; month = shiftMonth(month, 1)) months.push(month)
  return months
}

export type GoalPlan = {
  activeClients: number
  recurringRevenue: number
  ticket: number | null
  avgFixed: number
  avgInvestment: number
  avgChurn: number
  trafficCac: number | null
  breakEvenClients: number | null
  goalClients: number | null
  missingClients: number | null
  newPerMonth: number | null
  trafficBudget: number | null
}

// Metas: quantos clientes ativos para pagar TODOS os custos (fixos + imposto + investimento nos processos)
// e para chegar ao lucro desejado. Usa a média dos últimos 3 meses fechados + o fixo atual da equipe (SDR).
export function planGoals(data: PanelData, profitGoal: number | null, month = currentMonthKey()): GoalPlan {
  const active = data.clients.filter((client) => client.status === 'active')
  const recurringRevenue = active.reduce((sum, client) => sum + monthlyValueOf(client), 0)
  const ticket = active.length ? recurringRevenue / active.length : null

  const closed = [shiftMonth(month, -3), shiftMonth(month, -2), shiftMonth(month, -1)]
  const summaries = closed.map((key) => summarizeMonth(data, key))
  // Equipe é custo novo e fixo: usa o valor do próximo mês no lugar da média do passado.
  const nextTeam = data.recurring
    .filter((item) => item.category === 'salario' && recurringActiveIn(item, shiftMonth(month, 1)))
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const pastTeam = summaries.reduce((sum, item) => sum + item.team, 0) / summaries.length
  const avgFixed =
    summaries.reduce((sum, item) => sum + item.fixed + item.tax, 0) / summaries.length + Math.max(nextTeam - pastTeam, 0)
  const avgInvestment = summaries.reduce((sum, item) => sum + item.investment, 0) / summaries.length
  const avgChurn =
    summaries.reduce((sum, item) => sum + item.channels.reduce((n, row) => n + row.churned.length, 0), 0) /
    summaries.length
  const traffic = summaries.map((item) => item.channels.find((row) => row.channel === 'trafego')!)
  const trafficNew = traffic.reduce((sum, row) => sum + row.newClients.length, 0)
  const trafficSpent = traffic.reduce((sum, row) => sum + row.investment, 0)
  const trafficCac = trafficNew ? trafficSpent / trafficNew : null

  const costs = avgFixed + avgInvestment
  const breakEvenClients = ticket ? Math.ceil(costs / ticket) : null
  const goalClients = ticket && profitGoal ? Math.ceil((costs + profitGoal) / ticket) : null
  const missingClients = goalClients !== null ? Math.max(goalClients - active.length, 0) : null
  // Repor quem sai + chegar na meta em 3 meses.
  const newPerMonth = missingClients !== null ? Math.ceil(avgChurn + missingClients / 3) : null
  const trafficBudget = newPerMonth !== null && trafficCac !== null ? newPerMonth * trafficCac : null

  return {
    activeClients: active.length,
    recurringRevenue,
    ticket,
    avgFixed,
    avgInvestment,
    avgChurn,
    trafficCac,
    breakEvenClients,
    goalClients,
    missingClients,
    newPerMonth,
    trafficBudget,
  }
}

export function money(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
