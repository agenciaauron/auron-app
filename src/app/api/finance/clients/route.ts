import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const validStatuses = new Set(['active', 'paused', 'cancelled'])
const validCycles = new Set(['monthly', 'biweekly'])

// Início da cobrança: nada antes dessa data é cobrado. Formato YYYY-MM-DD.
function parseStart(body: Record<string, unknown>) {
  const value = String(body.billingStart || '').trim()
  if (!value) return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

// Quinzenal exige um segundo dia de vencimento; mensal não usa.
function parseBilling(body: Record<string, unknown>, dueDay: number) {
  const billingCycle = String(body.billingCycle || 'monthly')
  if (!validCycles.has(billingCycle)) return null

  if (billingCycle === 'monthly') {
    return { billing_cycle: billingCycle, second_due_day: null }
  }

  const secondDueDay = Number(body.secondDueDay)
  if (!Number.isInteger(secondDueDay) || secondDueDay < 1 || secondDueDay > 31 || secondDueDay === dueDay) {
    return null
  }
  return { billing_cycle: billingCycle, second_due_day: secondDueDay }
}

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
    return NextResponse.json({ error: 'Preencha nome, valor e dia de vencimento corretamente.' }, { status: 400 })
  }

  const billing = parseBilling(body, dueDay)
  if (!billing) {
    return NextResponse.json({ error: 'No quinzenal, informe um segundo dia de vencimento diferente do primeiro.' }, { status: 400 })
  }

  const billingStart = parseStart(body)
  if (billingStart === null) {
    return NextResponse.json({ error: 'Data de início da cobrança inválida.' }, { status: 400 })
  }

  const { error } = await supabase.from('finance_clients').insert({
    company_id: companyId,
    name,
    monthly_amount: monthlyAmount,
    due_day: dueDay,
    ...billing,
    ...(billingStart ? { billing_start: billingStart } : {}),
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

  const billing = parseBilling(body, dueDay)
  if (!billing) {
    return NextResponse.json({ error: 'No quinzenal, informe um segundo dia de vencimento diferente do primeiro.' }, { status: 400 })
  }

  const billingStart = parseStart(body)
  if (billingStart === null) {
    return NextResponse.json({ error: 'Data de início da cobrança inválida.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('finance_clients')
    .update({
      name,
      monthly_amount: monthlyAmount,
      due_day: dueDay,
      ...billing,
      ...(billingStart ? { billing_start: billingStart } : {}),
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
