import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { LOST_REASONS } from '@/lib/lead-cleanup'

const MAX_LEADS = 500

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const action = body?.action
  const reason = String(body?.reason || '').trim()
  const leadIds: string[] = Array.isArray(body?.leadIds)
    ? body.leadIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : []

  if (!['disqualify', 'delete'].includes(action) || leadIds.length === 0) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  if (leadIds.length > MAX_LEADS) {
    return NextResponse.json(
      { error: `Selecione no máximo ${MAX_LEADS} leads por vez.` },
      { status: 400 }
    )
  }

  if (action === 'disqualify' && !(LOST_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: 'Escolha um motivo válido.' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })
  }

  if (action === 'delete') {
    const { data, error } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)
      .eq('company_id', membership.company_id)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidatePath('/leads')
    revalidatePath('/dashboard')
    return NextResponse.json({ success: true, count: data?.length ?? 0 })
  }

  const { data: lostStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('company_id', membership.company_id)
    .eq('is_lost', true)
    .order('position')
    .limit(1)
    .single()

  if (!lostStage) {
    return NextResponse.json(
      { error: 'Nenhuma etapa de perda configurada no funil.' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('leads')
    .update({
      stage_id: lostStage.id,
      lost_reason: reason,
      lost_at: now,
      updated_at: now,
    })
    .in('id', leadIds)
    .eq('company_id', membership.company_id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return NextResponse.json({ success: true, count: data?.length ?? 0 })
}
