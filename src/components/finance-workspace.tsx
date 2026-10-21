'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type FinanceClient = {
  id: string
  name: string
  monthly_amount: number | string
  due_day: number
  status: 'active' | 'paused' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
}

type FinancePayment = {
  id: string
  finance_client_id: string
  competence: string
  due_date: string
  paid_at: string
  amount: number | string
  payment_method: string | null
  notes: string | null
  created_at: string
}

type Props = {
  clients: FinanceClient[]
  payments: FinancePayment[]
  financeReady: boolean
}

type Tab = 'overview' | 'clients' | 'ads' | 'expenses'

function money(value: number | string) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function isoToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentCompetence() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function competenceDate(value: string) {
  return value.slice(0, 7)
}

function dueDateForCurrentMonth(dueDay: number) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(dueDay, lastDay))
}

// Diferença em dias de calendário (ignora horário e horário de verão).
// Antes o vencimento era 23:59 e "hoje" 00:00, o que deixava tudo 1 dia adiantado.
function daysBetween(a: Date, b: Date) {
  const dayMs = 1000 * 60 * 60 * 24
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcA - utcB) / dayMs)
}

export function FinanceWorkspace({ clients, payments, financeReady }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [clientModal, setClientModal] = useState<FinanceClient | 'new' | null>(null)
  const [paymentClient, setPaymentClient] = useState<FinanceClient | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const competence = currentCompetence()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const activeClients = clients.filter((client) => client.status === 'active')
  const monthPayments = payments.filter((payment) => competenceDate(payment.competence) === competence)
  const cashThisMonth = payments.filter((payment) => payment.paid_at.slice(0, 7) === competence)

  const stats = useMemo(() => {
    const recurring = activeClients.reduce((sum, client) => sum + Number(client.monthly_amount), 0)
    const received = cashThisMonth.reduce((sum, payment) => sum + Number(payment.amount), 0)

    let receivable = 0
    let overdue = 0

    for (const client of activeClients) {
      const paid = monthPayments.some((payment) => payment.finance_client_id === client.id)
      if (paid) continue

      const amount = Number(client.monthly_amount)
      receivable += amount

      if (dueDateForCurrentMonth(client.due_day) < today) {
        overdue += amount
      }
    }

    return { recurring, received, receivable, overdue }
  }, [activeClients, cashThisMonth, monthPayments, today])

  function paymentForCurrentMonth(clientId: string) {
    return monthPayments.find((payment) => payment.finance_client_id === clientId)
  }

  function lastPayment(clientId: string) {
    return payments.find((payment) => payment.finance_client_id === clientId)
  }

  function billingStatus(client: FinanceClient) {
    if (client.status === 'paused') {
      return { label: 'Pausado', className: 'border-ink-700 bg-ink-800/70 text-ink-300' }
    }

    if (client.status === 'cancelled') {
      return { label: 'Cancelado', className: 'border-ink-800 bg-ink-900 text-ink-500' }
    }

    const paid = paymentForCurrentMonth(client.id)
    if (paid) {
      return { label: 'Pago', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' }
    }

    const dueDate = dueDateForCurrentMonth(client.due_day)
    const difference = daysBetween(dueDate, today)

    if (difference < 0) {
      const lateDays = Math.abs(difference)
      return {
        label: `Atrasado ${lateDays} ${lateDays === 1 ? 'dia' : 'dias'}`,
        className: 'border-red-500/20 bg-red-500/10 text-red-300',
      }
    }

    if (difference === 0) {
      return { label: 'Vence hoje', className: 'border-amber-500/20 bg-amber-500/10 text-amber-300' }
    }

    if (difference <= 3) {
      return { label: difference === 1 ? 'Vence amanhã' : `Vence em ${difference} dias`, className: 'border-amber-500/20 bg-amber-500/10 text-amber-300' }
    }

    return { label: 'Em dia', className: 'border-auron-500/20 bg-auron-500/10 text-auron-300' }
  }

  const attentionClients = activeClients
    .filter((client) => !paymentForCurrentMonth(client.id))
    .sort((a, b) => a.due_day - b.due_day)
    .slice(0, 6)

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clientModal) return

    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const editing = clientModal !== 'new'

    const response = await fetch('/api/finance/clients', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: editing ? clientModal.id : undefined,
        name: form.get('name'),
        monthlyAmount: form.get('monthlyAmount'),
        dueDay: form.get('dueDay'),
        status: editing ? form.get('status') : 'active',
        notes: form.get('notes'),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Não foi possível salvar o cliente.')
      setLoading(false)
      return
    }

    setLoading(false)
    setClientModal(null)
    router.refresh()
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paymentClient) return

    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)

    const response = await fetch('/api/finance/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        financeClientId: paymentClient.id,
        competence: form.get('competence'),
        paidAt: form.get('paidAt'),
        amount: form.get('amount'),
        paymentMethod: form.get('paymentMethod'),
        notes: form.get('notes'),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Não foi possível registrar o pagamento.')
      setLoading(false)
      return
    }

    setLoading(false)
    setPaymentClient(null)
    router.refresh()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Visão geral' },
    { key: 'clients', label: 'Clientes' },
    { key: 'ads', label: 'Anúncios' },
    { key: 'expenses', label: 'Despesas' },
  ]

  if (!financeReady) {
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Financeiro</p>
        <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">Controle financeiro</h1>
        <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="font-medium text-amber-200">Estrutura financeira ainda não configurada.</p>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            A tela já está instalada no CRM. Falta apenas aplicar a migration das tabelas financeiras no Supabase.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Financeiro</p>
          <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">Controle financeiro</h1>
          <p className="mt-2 text-sm text-ink-500">
            Recorrência, cobranças, pagamentos e visão financeira da operação.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError('')
            setClientModal('new')
          }}
          className="rounded-lg bg-auron-600 px-4 py-2.5 text-sm font-medium transition hover:bg-auron-500"
        >
          Novo cliente financeiro
        </button>
      </header>

      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-ink-800 bg-ink-900 p-1">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-4 py-2 text-sm transition ${
              tab === item.key
                ? 'bg-auron-600 text-white'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Receita recorrente', stats.recurring, 'Mensalidades de clientes ativos'],
              ['Recebido no mês', stats.received, 'Entradas registradas neste mês'],
              ['A receber', stats.receivable, 'Cobranças do mês ainda pendentes'],
              ['Em atraso', stats.overdue, 'Valor vencido e ainda não pago'],
            ].map(([label, value, description]) => (
              <div key={String(label)} className="rounded-2xl border border-ink-800 bg-ink-900/55 p-5">
                <p className="text-xs uppercase tracking-wide text-ink-600">{String(label)}</p>
                <p className="mt-2 font-display text-2xl font-semibold tabular text-ink-50">{money(Number(value))}</p>
                <p className="mt-2 text-xs text-ink-600">{String(description)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <section className="rounded-2xl border border-ink-800 bg-ink-900/45">
              <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-ink-200">Cobranças que pedem atenção</h2>
                  <p className="mt-1 text-xs text-ink-600">Clientes ativos sem pagamento registrado na competência atual.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('clients')}
                  className="text-sm text-auron-400 hover:text-auron-300"
                >
                  Ver clientes
                </button>
              </div>

              <div className="divide-y divide-ink-800/80">
                {attentionClients.map((client) => {
                  const status = billingStatus(client)
                  return (
                    <div key={client.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-ink-200">{client.name}</p>
                        <p className="mt-1 text-xs text-ink-600">
                          {money(client.monthly_amount)} · vence dia {String(client.due_day).padStart(2, '0')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${status.className}`}>
                          {status.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setError('')
                            setPaymentClient(client)
                          }}
                          className="rounded-lg border border-ink-700 px-3 py-2 text-xs text-ink-300 transition hover:bg-ink-800"
                        >
                          Registrar pagamento
                        </button>
                      </div>
                    </div>
                  )
                })}

                {attentionClients.length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-ink-600">
                    Nenhuma cobrança pendente no momento.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-ink-800 bg-ink-900/45 p-5">
              <p className="text-xs uppercase tracking-wide text-ink-600">Carteira recorrente</p>
              <p className="mt-2 font-display text-3xl font-semibold tabular text-ink-50">{activeClients.length}</p>
              <p className="mt-1 text-sm text-ink-500">clientes ativos</p>

              <div className="mt-6 space-y-3 border-t border-ink-800 pt-5">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-500">Pagos no mês</span>
                  <span className="font-medium text-emerald-300">
                    {activeClients.filter((client) => paymentForCurrentMonth(client.id)).length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-500">Pendentes</span>
                  <span className="font-medium text-amber-300">
                    {activeClients.filter((client) => !paymentForCurrentMonth(client.id)).length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-500">Pausados</span>
                  <span className="font-medium text-ink-300">
                    {clients.filter((client) => client.status === 'paused').length}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/45">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  <th className="px-5 py-4 font-medium">Cliente</th>
                  <th className="px-5 py-4 font-medium">Mensalidade</th>
                  <th className="px-5 py-4 font-medium">Vencimento</th>
                  <th className="px-5 py-4 font-medium">Status do mês</th>
                  <th className="px-5 py-4 font-medium">Último pagamento</th>
                  <th className="px-5 py-4 font-medium">Situação</th>
                  <th className="px-5 py-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/80">
                {clients.map((client) => {
                  const status = billingStatus(client)
                  const last = lastPayment(client.id)

                  return (
                    <tr key={client.id} className="transition hover:bg-ink-900/80">
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink-200">{client.name}</p>
                        {client.notes && <p className="mt-1 max-w-[240px] truncate text-xs text-ink-600">{client.notes}</p>}
                      </td>
                      <td className="px-5 py-4 font-medium text-ink-300">{money(client.monthly_amount)}</td>
                      <td className="px-5 py-4 text-ink-400">Dia {String(client.due_day).padStart(2, '0')}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-ink-500">
                        {last ? new Date(`${last.paid_at}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium ${
                          client.status === 'active'
                            ? 'text-emerald-300'
                            : client.status === 'paused'
                              ? 'text-amber-300'
                              : 'text-ink-500'
                        }`}>
                          {client.status === 'active' ? 'Ativo' : client.status === 'paused' ? 'Pausado' : 'Cancelado'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setError('')
                              setPaymentClient(client)
                            }}
                            className="rounded-lg bg-auron-600/15 px-3 py-2 text-xs font-medium text-auron-300 transition hover:bg-auron-600/25"
                          >
                            Registrar pagamento
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setError('')
                              setClientModal(client)
                            }}
                            className="rounded-lg border border-ink-700 px-3 py-2 text-xs text-ink-400 transition hover:bg-ink-800 hover:text-ink-200"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {clients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-ink-600">
                      Nenhum cliente financeiro cadastrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(tab === 'ads' || tab === 'expenses') && (
        <div className="rounded-2xl border border-ink-800 bg-ink-900/45 p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">
            {tab === 'ads' ? 'Investimentos em anúncios' : 'Despesas da empresa'}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            {tab === 'ads' ? 'Controle de verba dos clientes' : 'Gastos e contas a pagar'}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">
            A estrutura visual desta área já está separada do recebimento dos clientes para não misturar verba de mídia com receita da Auron. A automação e os lançamentos desta seção entram na próxima etapa.
          </p>
        </div>
      )}

      {clientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-ink-800 bg-ink-900 p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-auron-400">Financeiro</p>
                <h2 className="mt-1 text-xl font-semibold">
                  {clientModal === 'new' ? 'Novo cliente financeiro' : 'Editar cliente'}
                </h2>
              </div>
              <button type="button" onClick={() => setClientModal(null)} className="text-sm text-ink-500 hover:text-white">
                Fechar
              </button>
            </div>

            <form onSubmit={saveClient} className="space-y-4">
              <input
                name="name"
                required
                defaultValue={clientModal === 'new' ? '' : clientModal.name}
                placeholder="Nome do cliente"
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 outline-none focus:border-auron-500"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Valor mensal</span>
                  <input
                    name="monthlyAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={clientModal === 'new' ? '' : Number(clientModal.monthly_amount)}
                    placeholder="R$ 0,00"
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none focus:border-auron-500"
                  />
                </label>

                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Dia do vencimento</span>
                  <input
                    name="dueDay"
                    type="number"
                    min="1"
                    max="31"
                    required
                    defaultValue={clientModal === 'new' ? '' : clientModal.due_day}
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none focus:border-auron-500"
                  />
                </label>
              </div>

              {clientModal !== 'new' && (
                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Situação do cliente</span>
                  <select
                    name="status"
                    defaultValue={clientModal.status}
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none"
                  >
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
              )}

              <textarea
                name="notes"
                rows={3}
                defaultValue={clientModal === 'new' ? '' : clientModal.notes ?? ''}
                placeholder="Observações"
                className="w-full resize-none rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm outline-none focus:border-auron-500"
              />

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                disabled={loading}
                className="w-full rounded-lg bg-auron-600 px-4 py-3 font-medium transition hover:bg-auron-500 disabled:opacity-60"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {paymentClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-ink-800 bg-ink-900 p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-400">Registrar pagamento</p>
                <h2 className="mt-1 text-xl font-semibold">{paymentClient.name}</h2>
              </div>
              <button type="button" onClick={() => setPaymentClient(null)} className="text-sm text-ink-500 hover:text-white">
                Fechar
              </button>
            </div>

            <form onSubmit={savePayment} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Competência</span>
                  <input
                    name="competence"
                    type="month"
                    required
                    defaultValue={competence}
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none"
                  />
                </label>

                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Data do pagamento</span>
                  <input
                    name="paidAt"
                    type="date"
                    required
                    defaultValue={isoToday()}
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Valor recebido</span>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={Number(paymentClient.monthly_amount)}
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none"
                  />
                </label>

                <label className="text-xs text-ink-500">
                  <span className="mb-1.5 block">Forma de pagamento</span>
                  <select
                    name="paymentMethod"
                    defaultValue="PIX"
                    className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-ink-200 outline-none"
                  >
                    <option>PIX</option>
                    <option>Boleto</option>
                    <option>Transferência</option>
                    <option>Cartão</option>
                    <option>Dinheiro</option>
                    <option>Outro</option>
                  </select>
                </label>
              </div>

              <textarea
                name="notes"
                rows={3}
                placeholder="Observação do pagamento"
                className="w-full resize-none rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm outline-none focus:border-auron-500"
              />

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                disabled={loading}
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {loading ? 'Registrando...' : 'Confirmar pagamento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
