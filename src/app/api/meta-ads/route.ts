import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizeAdAccountId, syncMetaAdInsights } from '@/lib/meta-ads'

async function getContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return { supabase, companyId: null, error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!membership) {
    return { supabase, companyId: null, error: NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 }) }
  }

  return { supabase, companyId: membership.company_id as string, error: null }
}

// Salva a conta de anúncios ({ adAccountId }) e já faz a primeira sincronização.
export async function PUT(request: Request) {
  const context = await getContext()
  if (context.error) return context.error
  if (!context.companyId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { supabase, companyId } = context
  const body = await request.json()
  const adAccountId = normalizeAdAccountId(String(body.adAccountId || ''))

  if (!adAccountId) {
    return NextResponse.json({ error: 'ID da conta inválido. Use só os números, ex.: 123456789.' }, { status: 400 })
  }

  const { data: current } = await supabase
    .from('meta_ad_accounts')
    .select('ad_account_id')
    .eq('company_id', companyId)
    .maybeSingle()

  const changed = current?.ad_account_id !== adAccountId

  if (changed && current) {
    // Trocou de conta: o gasto antigo não vale mais.
    await supabase.from('meta_ad_insights').delete().eq('company_id', companyId)
    await supabase.from('meta_ad_objects').delete().eq('company_id', companyId)
  }

  const { error } = await supabase
    .from('meta_ad_accounts')
    .upsert({
      company_id: companyId,
      ad_account_id: adAccountId,
      ...(changed ? { last_synced_at: null, last_sync_error: null } : {}),
      updated_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = await syncMetaAdInsights({ supabase, companyId })
  revalidatePath('/campanhas')

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// Atualiza o gasto dos últimos dias.
export async function POST() {
  const context = await getContext()
  if (context.error) return context.error
  if (!context.companyId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const result = await syncMetaAdInsights({ supabase: context.supabase, companyId: context.companyId })
  revalidatePath('/campanhas')

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
