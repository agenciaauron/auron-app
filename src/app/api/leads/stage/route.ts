import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { syncMetaEvent } from '@/lib/meta-events'

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json(
      { error: 'Não autorizado' },
      { status: 401 }
    )
  }

  const { leadId, stageId } = await request.json()

  if (!leadId || !stageId) {
    return NextResponse.json(
      { error: 'Lead ou etapa inválida' },
      { status: 400 }
    )
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json(
      { error: 'Empresa não encontrada' },
      { status: 400 }
    )
  }

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, name, is_won, is_lost')
    .eq('id', stageId)
    .eq('company_id', membership.company_id)
    .single()

  if (!stage) {
    return NextResponse.json(
      { error: 'Etapa inválida' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      stage_id: stageId,
      updated_at: new Date().toISOString(),
      ...(stage.is_lost
        ? { lost_at: new Date().toISOString() }
        : { lost_reason: null, lost_at: null }),
    })
    .eq('id', leadId)
    .eq('company_id', membership.company_id)
    .select('id, sale_value')

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  if (!data?.length) {
    return NextResponse.json(
      { error: 'Lead não encontrado' },
      { status: 404 }
    )
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')

  const saleValue = data[0].sale_value == null ? null : Number(data[0].sale_value)
  const meta = await syncMetaEvent({
    supabase,
    leadId,
    stageName: stage.name,
    isWon: Boolean(stage.is_won),
    isLost: Boolean(stage.is_lost),
    saleValue,
  })

  return NextResponse.json({ success: true, meta })
}
