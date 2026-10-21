import type { SupabaseClient } from '@supabase/supabase-js'

// Busca o gasto diário por anúncio na API de Marketing da Meta e grava em meta_ad_insights.
// O token fica só no servidor (META_ADS_ACCESS_TOKEN) e precisa da permissão ads_read.

type InsightRow = {
  date_start: string
  ad_id: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  clicks?: string
}

type InsightsPage = {
  data?: InsightRow[]
  paging?: { next?: string }
  error?: { message?: string }
}

const graphVersion = process.env.META_GRAPH_VERSION || 'v24.0'

// Na primeira sincronização busca desde o primeiro lead; depois, só os últimos dias,
// porque a Meta ainda ajusta o gasto de dias recentes.
const resyncDays = 7

export function normalizeAdAccountId(value: string) {
  const digits = value.trim().replace(/^act_/i, '')
  return /^\d+$/.test(digits) ? `act_${digits}` : null
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

async function fetchInsights(adAccountId: string, since: string, until: string, token: string) {
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
    access_token: token,
  })

  const rows: InsightRow[] = []
  let url: string | undefined = `https://graph.facebook.com/${graphVersion}/${adAccountId}/insights?${params}`

  while (url) {
    const response = await fetch(url, { cache: 'no-store' })
    const page = (await response.json()) as InsightsPage

    if (!response.ok || page.error) {
      throw new Error(page.error?.message || `A Meta respondeu com erro ${response.status}.`)
    }

    rows.push(...(page.data ?? []))
    url = page.paging?.next
  }

  return rows
}

export async function syncMetaAdInsights({
  supabase,
  companyId,
}: {
  supabase: SupabaseClient
  companyId: string
}) {
  const token = process.env.META_ADS_ACCESS_TOKEN
  if (!token) {
    return { ok: false, error: 'Token da Meta não configurado no servidor (META_ADS_ACCESS_TOKEN).' }
  }

  const { data: account } = await supabase
    .from('meta_ad_accounts')
    .select('ad_account_id, last_synced_at')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!account) {
    return { ok: false, error: 'Informe o ID da conta de anúncios antes de sincronizar.' }
  }

  const until = new Date()
  let since: Date

  if (account.last_synced_at) {
    since = new Date(until.getTime() - resyncDays * 86400000)
  } else {
    const { data: firstLead } = await supabase
      .from('leads')
      .select('created_at')
      .eq('company_id', companyId)
      .not('meta_source_id', 'is', null)
      .order('created_at')
      .limit(1)
      .maybeSingle()

    since = firstLead ? new Date(firstLead.created_at) : new Date(until.getTime() - 90 * 86400000)
  }

  try {
    const rows = await fetchInsights(account.ad_account_id, dateKey(since), dateKey(until), token)
    const syncedAt = new Date().toISOString()

    const records = rows.map((row) => ({
      company_id: companyId,
      ad_account_id: account.ad_account_id,
      date: row.date_start,
      ad_id: row.ad_id,
      ad_name: row.ad_name ?? null,
      adset_id: row.adset_id ?? null,
      adset_name: row.adset_name ?? null,
      campaign_id: row.campaign_id ?? null,
      campaign_name: row.campaign_name ?? null,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      synced_at: syncedAt,
    }))

    for (let index = 0; index < records.length; index += 500) {
      const { error } = await supabase
        .from('meta_ad_insights')
        .upsert(records.slice(index, index + 500), { onConflict: 'company_id,ad_id,date' })

      if (error) throw new Error(error.message)
    }

    await supabase
      .from('meta_ad_accounts')
      .update({ last_synced_at: syncedAt, last_sync_error: null, updated_at: syncedAt })
      .eq('company_id', companyId)

    return { ok: true, rows: records.length, synced_at: syncedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao buscar dados da Meta.'

    await supabase
      .from('meta_ad_accounts')
      .update({ last_sync_error: message, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)

    return { ok: false, error: message }
  }
}
