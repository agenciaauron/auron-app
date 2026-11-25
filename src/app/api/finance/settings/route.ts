import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'

// Meta de lucro por mês (vazio = sem meta).
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext({ managerOnly: true })
  if (contextError) return contextError
  const { supabase, companyId } = context

  const body = await request.json()
  const raw = String(body.profitGoal ?? '').trim()
  const profitGoal = raw === '' ? null : Number(raw)

  if (profitGoal !== null && (!Number.isFinite(profitGoal) || profitGoal < 0)) {
    return NextResponse.json({ error: 'Meta de lucro inválida.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('finance_settings')
    .upsert({ company_id: companyId, profit_goal: profitGoal, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/financeiro')
  return NextResponse.json({ success: true })
}
