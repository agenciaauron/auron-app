import { NextResponse } from 'next/server'
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

  const body = await request.json()

  const {
    leadId,
    name,
    phone,
    email,
    source,
    campaign,
    notes,
    saleValue,
    stageId,
  } = body

  if (!leadId || !name?.trim()) {
    return NextResponse.json(
      { error: 'Dados inválidos' },
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
    .select('id, name, is_won')
    .eq('id', stageId)
    .eq('company_id', membership.company_id)
    .single()

  if (!stage) {
    return NextResponse.json(
      { error: 'Etapa inválida' },
      { status: 400 }
    )
  }

  const parsedSaleValue =
    saleValue === '' || saleValue == null
      ? null
      : Number(saleValue)

  if (parsedSaleValue !== null && Number.isNaN(parsedSaleValue)) {
    return NextResponse.json(
      { error: 'Valor da venda inválido' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      source: source?.trim() || null,
      campaign: campaign?.trim() || null,
      notes: notes?.trim() || null,
      sale_value: stage.is_won ? parsedSaleValue : null,
      stage_id: stageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('company_id', membership.company_id)
    .select('id')

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

  const meta = await syncMetaEvent({
    supabase,
    leadId,
    stageName: stage.name,
    isWon: Boolean(stage.is_won),
    saleValue: stage.is_won ? parsedSaleValue : null,
  })

  return NextResponse.json({ success: true, meta })
}
