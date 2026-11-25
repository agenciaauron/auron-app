import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { RECURRING_CATEGORIES, isFinanceChannel, type ExpenseCategory } from '@/lib/finance'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Gasto fixo: cadastrado uma vez, conta todo mês a partir do início.
export async function POST(request: Request) {
  const { context, error: contextError } = await requireApiContext({ managerOnly: true })
  if (contextError) return contextError
  const { supabase, companyId } = context

  const body = await request.json()
  const name = String(body.name || '').trim()
  const amount = Number(body.amount)
  const category = body.category as ExpenseCategory
  const startsOn = String(body.startsOn || '')
  const channel = isFinanceChannel(body.channel) ? body.channel : null

  if (!name || !Number.isFinite(amount) || amount <= 0 || !RECURRING_CATEGORIES.includes(category) || !DATE.test(startsOn)) {
    return NextResponse.json({ error: 'Preencha nome, valor, tipo e início do gasto fixo.' }, { status: 400 })
  }

  const { error } = await supabase.from('finance_recurring_expenses').insert({
    company_id: companyId,
    name,
    amount,
    category,
    channel,
    starts_on: `${startsOn.slice(0, 7)}-01`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}

// Encerrar (parou de pagar) ou mudar o valor a partir de um mês: { id, endsOn }.
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext({ managerOnly: true })
  if (contextError) return contextError
  const { supabase, companyId } = context

  const body = await request.json()
  const id = String(body.id || '')
  const endsOn = body.endsOn === null ? null : String(body.endsOn || '')

  if (!id || (endsOn !== null && !DATE.test(endsOn))) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('finance_recurring_expenses')
    .update({ ends_on: endsOn, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Gasto fixo não encontrado.' }, { status: 404 })

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { context, error: contextError } = await requireApiContext({ managerOnly: true })
  if (contextError) return contextError
  const { supabase, companyId } = context

  const body = await request.json()
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'Gasto fixo inválido.' }, { status: 400 })

  const { data, error } = await supabase
    .from('finance_recurring_expenses')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Gasto fixo não encontrado.' }, { status: 404 })

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}
