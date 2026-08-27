import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const validStatuses = new Set(['active', 'paused', 'cancelled'])

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

  return { supabase, companyId: membership.company_id, error: null }
}

export async function POST(request: Request) {
  const context = await getContext()
  if (context.error) return context.error
  if (!context.companyId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { supabase, companyId } = context
  const body = await request.json()
  const name = String(body.name || '').trim()
  const monthlyAmount = Number(body.monthlyAmount)
  const dueDay = Number(body.dueDay)
  const notes = String(body.notes || '').trim() || null

  if (!name || !Number.isFinite(monthlyAmount) || monthlyAmount < 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return NextResponse.json({ error: 'Preencha nome, valor mensal e dia de vencimento corretamente.' }, { status: 400 })
  }

  const { error } = await supabase.from('finance_clients').insert({
    company_id: companyId,
    name,
    monthly_amount: monthlyAmount,
    due_day: dueDay,
    notes,
    status: 'active',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}

export async function PATCH(request: Request) {
  const context = await getContext()
  if (context.error) return context.error
  if (!context.companyId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { supabase, companyId } = context
  const body = await request.json()
  const clientId = String(body.clientId || '')
  const name = String(body.name || '').trim()
  const monthlyAmount = Number(body.monthlyAmount)
  const dueDay = Number(body.dueDay)
  const status = String(body.status || 'active')
  const notes = String(body.notes || '').trim() || null

  if (!clientId || !name || !Number.isFinite(monthlyAmount) || monthlyAmount < 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || !validStatuses.has(status)) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('finance_clients')
    .update({
      name,
      monthly_amount: monthlyAmount,
      due_day: dueDay,
      status,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .eq('company_id', companyId)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data?.length) {
    return NextResponse.json({ error: 'Cliente financeiro não encontrado.' }, { status: 404 })
  }

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}
