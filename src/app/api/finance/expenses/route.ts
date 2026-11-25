import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { defaultChannelFor, isExpenseCategory, isFinanceChannel } from '@/lib/finance'

// Gasto lançado à mão: recarga da Meta, imposto, retirada, avulsos. Só dono/administrador.
export async function POST(request: Request) {
  const { context, error: contextError } = await requireApiContext({ managerOnly: true })
  if (contextError) return contextError
  const { supabase, companyId, userId } = context

  const body = await request.json()
  const spentAt = String(body.spentAt || '')
  const amount = Number(body.amount)
  const category = body.category
  const description = String(body.description || '').trim() || null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentAt) || !Number.isFinite(amount) || amount <= 0 || !isExpenseCategory(category)) {
    return NextResponse.json({ error: 'Preencha data, valor e tipo do gasto.' }, { status: 400 })
  }

  // Recarga da Meta é sempre do tráfego; retirada, reserva, imposto e devolução não são de processo.
  const fixedChannel = defaultChannelFor(category)
  const noChannel = ['retirada', 'reserva', 'imposto', 'devolucao'].includes(category)
  const channel = fixedChannel ?? (noChannel ? null : isFinanceChannel(body.channel) ? body.channel : null)

  const { error } = await supabase.from('finance_expenses').insert({
    company_id: companyId,
    spent_at: spentAt,
    amount,
    category,
    channel,
    description,
    source: 'manual',
    created_by: userId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { context, error: contextError } = await requireApiContext({ managerOnly: true })
  if (contextError) return contextError
  const { supabase, companyId } = context

  const body = await request.json()
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'Gasto inválido.' }, { status: 400 })

  const { data, error } = await supabase
    .from('finance_expenses')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Gasto não encontrado.' }, { status: 404 })

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}
