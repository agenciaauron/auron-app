import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'

// Resultado da reunião: { leadId, status: 'realizada' | 'nao_compareceu' }.
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId } = context
  const { leadId, status } = await request.json()

  if (!leadId || !['realizada', 'nao_compareceu'].includes(status)) {
    return NextResponse.json({ error: 'Resultado inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ meeting_status: status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .not('meeting_at', 'is', null)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data?.length) {
    return NextResponse.json({ error: 'Esse lead não tem reunião marcada.' }, { status: 404 })
  }

  await supabase.from('lead_activities').insert({
    company_id: companyId,
    lead_id: leadId,
    user_id: userId,
    type: status === 'realizada' ? 'reuniao_realizada' : 'nao_compareceu',
    note: null,
  })

  revalidatePath('/comercial')

  return NextResponse.json({ success: true })
}
