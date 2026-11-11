import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { CommissionsWorkspace } from '@/components/commissions-workspace'
import { getCrmContext, loadTeam } from '@/lib/crm-context'

export default async function CommissionsPage() {
  const { supabase, userId, companyId, role } = await getCrmContext()

  if (!userId) {
    redirect('/login')
  }

  if (!companyId || !role) {
    return (
      <main className="min-h-screen bg-ink-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  const [companyResult, salesResult, meetingsResult, team] = await Promise.all([
    supabase.from('companies').select('id, name').eq('id', companyId).single(),
    supabase
      .from('leads')
      .select('id, name, origin, sdr_id, sale_value, won_at')
      .eq('company_id', companyId)
      .not('won_at', 'is', null)
      .order('won_at', { ascending: false }),
    supabase
      .from('lead_activities')
      .select('user_id, type, created_at')
      .eq('company_id', companyId)
      .in('type', ['reuniao_marcada', 'reuniao_realizada']),
    loadTeam(supabase, companyId),
  ])

  return (
    <CrmShell companyName={companyResult.data?.name ?? 'Empresa'} role={role} activeItem="commissions">
      <header className="mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-auron-400">Comissões</p>
        <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-tight text-ink-50">
          {role === 'sdr' ? 'Minhas comissões' : 'Comissões do SDR'}
        </h1>
        <p className="mt-2 text-sm text-ink-500">Vendas fechadas no mês e quanto cada uma rende de comissão.</p>
      </header>

      <CommissionsWorkspace
        userId={userId}
        role={role}
        sales={salesResult.data ?? []}
        meetings={meetingsResult.data ?? []}
        team={team}
      />
    </CrmShell>
  )
}
