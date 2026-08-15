import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
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
  const { name, phone, email, source, campaign } = body

  if (!name?.trim()) {
    return NextResponse.json(
      { error: 'Nome é obrigatório' },
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

  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('company_id', membership.company_id)
    .order('position')
    .limit(1)
    .single()

  if (!firstStage) {
    return NextResponse.json(
      { error: 'Etapa inicial não encontrada' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('leads')
    .insert({
      company_id: membership.company_id,
      stage_id: firstStage.id,
      assigned_to: userId,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      source: source?.trim() || null,
      campaign: campaign?.trim() || null,
    })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
