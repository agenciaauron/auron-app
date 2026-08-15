import { CrmPipeline } from '@/components/crm-pipeline'
import { NewLeadForm } from '@/components/new-lead-form'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!membership) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', membership.company_id)
    .single()

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, position, is_won, is_lost')
    .eq('company_id', membership.company_id)
    .order('position')

  const { data: leads } = await supabase
    .from('leads')
    .select(
      'id, name, phone, email, source, campaign, notes, stage_id, estimated_value, sale_value'
    )
    .eq('company_id', membership.company_id)

  const { data: history } = await supabase
    .from('lead_history')
    .select(
      'id, lead_id, event_type, from_stage_id, to_stage_id, created_at'
    )
    .eq('company_id', membership.company_id)
    .order('created_at', { ascending: false })

  const allLeads = leads ?? []
  const allStages = stages ?? []
  const allHistory = history ?? []

  const wonStageIds = new Set(
    allStages.filter((stage) => stage.is_won).map((stage) => stage.id)
  )

  const lostStageIds = new Set(
    allStages.filter((stage) => stage.is_lost).map((stage) => stage.id)
  )

  const wonLeads = allLeads.filter(
    (lead) => lead.stage_id && wonStageIds.has(lead.stage_id)
  )

  const activeLeads = allLeads.filter(
    (lead) =>
      !lead.stage_id ||
      (!wonStageIds.has(lead.stage_id) && !lostStageIds.has(lead.stage_id))
  )

  const activePipelineValue = activeLeads.reduce(
    (total, lead) => total + Number(lead.estimated_value ?? 0),
    0
  )

  const totalSalesValue = wonLeads.reduce(
    (total, lead) => total + Number(lead.sale_value ?? lead.estimated_value ?? 0),
    0
  )

  const conversionRate = allLeads.length
    ? (wonLeads.length / allLeads.length) * 100
    : 0

  const navigation = [
    { label: 'Visão geral', status: 'active' },
    { label: 'Leads', status: 'soon' },
    { label: 'Contratos', status: 'soon' },
    { label: 'Financeiro', status: 'soon' },
    { label: 'Relatórios', status: 'soon' },
  ]

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-800/80 bg-zinc-950 lg:flex">
        <div className="flex h-20 items-center border-b border-zinc-800/80 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 font-semibold shadow-lg shadow-purple-950/40">
            A
          </div>
          <div className="ml-3">
            <p className="font-semibold tracking-tight">Auron CRM</p>
            <p className="text-xs text-zinc-500">Gestão comercial</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          {navigation.map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
                item.status === 'active'
                  ? 'bg-purple-600/15 font-medium text-purple-300'
                  : 'text-zinc-500'
              }`}
            >
              <span>{item.label}</span>
              {item.status === 'soon' && (
                <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                  Em breve
                </span>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-800/80 p-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="truncate text-sm font-medium">{company?.name}</p>
            <p className="mt-1 text-xs capitalize text-zinc-500">
              {membership.role}
            </p>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-64">
        <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex items-center lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 font-semibold">
              A
            </div>
            <div className="ml-3">
              <p className="font-semibold">Auron CRM</p>
              <p className="text-xs text-zinc-500">{company?.name}</p>
            </div>
          </div>

          <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-purple-400">Visão geral</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Funil comercial
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Acompanhe seus leads e avance as oportunidades até a venda.
              </p>
            </div>

            <NewLeadForm />
          </header>

          <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">Total de leads</p>
                <span className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                  CRM
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {allLeads.length}
              </p>
              <p className="mt-2 text-xs text-zinc-600">Leads cadastrados</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <p className="text-sm text-zinc-500">Oportunidades ativas</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {activeLeads.length}
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                Fora de venda e perdido
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <p className="text-sm text-zinc-500">Valor em negociação</p>
              <p className="mt-4 text-2xl font-semibold tracking-tight">
                {formatCurrency(activePipelineValue)}
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                Soma dos valores estimados
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">Vendas</p>
                <span className="text-xs text-emerald-400">
                  {conversionRate.toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })}% conversão
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight">
                {formatCurrency(totalSalesValue)}
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                {wonLeads.length} {wonLeads.length === 1 ? 'venda' : 'vendas'} concluídas
              </p>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Pipeline</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Arraste os cards entre as etapas ou use o seletor dentro do lead.
                </p>
              </div>

              <p className="text-xs text-zinc-600">
                Role horizontalmente para visualizar todas as etapas
              </p>
            </div>

            <CrmPipeline
              stages={allStages}
              leads={allLeads}
              history={allHistory}
            />
          </section>
        </div>
      </main>
    </div>
  )
}
