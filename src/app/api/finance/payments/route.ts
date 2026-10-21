import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function dueDateForCompetence(competence: string, dueDay: number) {
  const [year, month] = competence.split('-').map(Number)
  const safeDay = Math.min(dueDay, daysInMonth(year, month))
  return `${competence}-${String(safeDay).padStart(2, '0')}`
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
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

  const body = await request.json()
  const financeClientId = String(body.financeClientId || '')
  const competence = String(body.competence || '')
  const paidAt = String(body.paidAt || '')
  const paymentMethod = String(body.paymentMethod || '').trim() || null
  const notes = String(body.notes || '').trim() || null
  const amount = Number(body.amount)
  const installment = Number(body.installment || 1)

  if (!financeClientId || !/^\d{4}-\d{2}$/.test(competence) || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !Number.isFinite(amount) || amount < 0 || ![1, 2].includes(installment)) {
    return NextResponse.json({ error: 'Dados do pagamento inválidos.' }, { status: 400 })
  }

  const { data: financeClient } = await supabase
    .from('finance_clients')
    .select('id, due_day, billing_cycle, second_due_day')
    .eq('id', financeClientId)
    .eq('company_id', membership.company_id)
    .single()

  if (!financeClient) {
    return NextResponse.json({ error: 'Cliente financeiro não encontrado.' }, { status: 404 })
  }

  const competenceDate = `${competence}-01`
  if (installment === 2 && (financeClient.billing_cycle !== 'biweekly' || !financeClient.second_due_day)) {
    return NextResponse.json({ error: 'Esse cliente não tem segunda quinzena.' }, { status: 400 })
  }

  const dueDay = installment === 2 ? Number(financeClient.second_due_day) : Number(financeClient.due_day)
  const dueDate = dueDateForCompetence(competence, dueDay)

  const { error } = await supabase
    .from('finance_payments')
    .upsert({
      company_id: membership.company_id,
      finance_client_id: financeClientId,
      competence: competenceDate,
      due_date: dueDate,
      paid_at: paidAt,
      amount,
      installment,
      payment_method: paymentMethod,
      notes,
    }, { onConflict: 'finance_client_id,competence,installment' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}
