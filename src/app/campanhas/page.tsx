import { redirect } from 'next/navigation'
import { CrmShell } from '@/components/crm-shell'
import { CampaignsWorkspace } from '@/components/campaigns-workspace'
import { createClient } from '@/lib/supabase/server'

// O Supabase devolve no máximo 1000 linhas por consulta; o gasto diário por anúncio passa disso rápido.
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const pageSize = 1000
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

export default async function CampaignsPage() {
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
      <main className="min-h-screen bg-ink-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  const companyId = membership.company_id

  const [companyResult, accountResult, insightsResult, objectsResult, stagesResult, leadsResult, historyResult] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .single(),
      supabase
        .from('meta_ad_accounts')
        .select('ad_account_id, last_synced_at, last_sync_error')
        .eq('company_id', companyId)
        .maybeSingle(),
      fetchAll((from, to) =>
        supabase
          .from('meta_ad_insights')
          .select('date, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, impressions, clicks')
          .eq('company_id', companyId)
          .order('date')
          .order('ad_id')
          .range(from, to)
      ),
      fetchAll((from, to) =>
        supabase
          .from('meta_ad_objects')
          .select('object_id, level, name, effective_status, campaign_id, adset_id')
          .eq('company_id', companyId)
          .order('object_id')
          .range(from, to)
      ),
      supabase
        .from('pipeline_stages')
        .select('id, name, slug, position, is_won, is_lost')
        .eq('company_id', companyId)
        .order('position'),
      supabase
        .from('leads')
        .select('id, stage_id, sale_value, created_at, meta_source_id, meta_headline, meta_qualified_sent_at')
        .eq('company_id', companyId)
        .not('meta_source_id', 'is', null),
      fetchAll((from, to) =>
        supabase
          .from('lead_history')
          .select('id, lead_id, to_stage_id')
          .eq('company_id', companyId)
          .not('to_stage_id', 'is', null)
          .order('id')
          .range(from, to)
      ),
    ])

  const company = companyResult.data

  return (
    <CrmShell
      companyName={company?.name ?? 'Empresa'}
      role={membership.role}
      activeItem="campaigns"
    >
      <CampaignsWorkspace
        account={accountResult.data ?? null}
        insights={insightsResult.data ?? []}
        objects={objectsResult.data ?? []}
        stages={stagesResult.data ?? []}
        leads={leadsResult.data ?? []}
        history={historyResult.data ?? []}
        ready={!accountResult.error && !insightsResult.error}
      />
    </CrmShell>
  )
}
