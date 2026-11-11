import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { ACTIVITY_LABELS, fromLocalInput, type ActivityType } from '@/lib/crm'

// Registra uma atividade no lead ({ leadId, type, note }) e, se vier, já marca o próximo contato.
export async function POST(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId, role } = context
  const { leadId, type, note, nextActionAt, nextActionNote } = await request.json()

  if (!leadId || !(type in ACTIVITY_LABELS)) {
    return NextResponse.json({ error: 'Atividade inválida' }, { status: 400 })
  }

  const cleanNote = String(note ?? '').trim() || null
  if (type === 'nota' && !cleanNote) {
    return NextResponse.json({ error: 'Escreva a anotação.' }, { status: 400 })
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, sdr_id')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  const { error } = await supabase.from('lead_activities').insert({
    company_id: companyId,
    lead_id: leadId,
    user_id: userId,
    type: type as ActivityType,
    note: cleanNote,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const leadUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (nextActionAt !== undefined) {
    const nextAction = fromLocalInput(nextActionAt)
    leadUpdate.next_action_at = nextAction
    leadUpdate.next_action_note = nextAction ? String(nextActionNote ?? '').trim() || null : null
  }

  if (role === 'sdr' && !lead.sdr_id) {
    leadUpdate.sdr_id = userId
  }

  await supabase.from('leads').update(leadUpdate).eq('id', leadId).eq('company_id', companyId)

  revalidatePath('/comercial')

  return NextResponse.json({ success: true })
}
