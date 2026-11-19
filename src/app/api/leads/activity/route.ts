import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import {
  ACTIVITY_LABELS,
  ATTEMPTS_COUNTED_FROM,
  ATTEMPT_TYPES,
  CONVERSATION_STAGE_SLUG,
  ENTRY_STAGE_SLUG,
  fromLocalInput,
  suggestedFollowUp,
  type ActivityType,
} from '@/lib/crm'

// Registra uma atividade no lead ({ leadId, type, note, nextActionAt?, nextActionNote? }).
// Tentativa de contato (mensagem/ligação/não atendeu):
//   * sem nextActionAt, o próximo follow-up é agendado sozinho pela cadência (+1, +2, +4, +7 dias);
//   * lead em "Novo lead" vai sozinho para "Em conversa".
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
    .select('id, sdr_id, stage_id, created_at, last_message_at, meeting_status')
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

  const isAttempt = ATTEMPT_TYPES.has(type)
  const leadUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (nextActionAt !== undefined) {
    const nextAction = fromLocalInput(nextActionAt)
    leadUpdate.next_action_at = nextAction
    leadUpdate.next_action_note = nextAction ? String(nextActionNote ?? '').trim() || null : null
  } else if (isAttempt && lead.meeting_status !== 'agendada') {
    // Com reunião agendada a mensagem é combinado/confirmação: não agenda follow-up.
    // Conta as tentativas desde a última mensagem do lead (já com a que acabou de entrar).
    const lastInbound = lead.last_message_at ?? lead.created_at
    const since = new Date(lastInbound) > new Date(ATTEMPTS_COUNTED_FROM) ? lastInbound : ATTEMPTS_COUNTED_FROM
    const { count } = await supabase
      .from('lead_activities')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .in('type', [...ATTEMPT_TYPES])
      .gt('created_at', since)
    const next = suggestedFollowUp(count ?? 1)
    leadUpdate.next_action_at = next?.at ?? null
    leadUpdate.next_action_note = next?.note ?? null
  }

  if (isAttempt && lead.stage_id) {
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, slug')
      .eq('company_id', companyId)
      .in('slug', [ENTRY_STAGE_SLUG, CONVERSATION_STAGE_SLUG])
    const entry = stages?.find((stage) => stage.slug === ENTRY_STAGE_SLUG)
    const conversation = stages?.find((stage) => stage.slug === CONVERSATION_STAGE_SLUG)
    if (entry && conversation && lead.stage_id === entry.id) {
      leadUpdate.stage_id = conversation.id
    }
  }

  if (role === 'sdr' && !lead.sdr_id) {
    leadUpdate.sdr_id = userId
  }

  await supabase.from('leads').update(leadUpdate).eq('id', leadId).eq('company_id', companyId)

  revalidatePath('/comercial')

  return NextResponse.json({ success: true, movedTo: leadUpdate.stage_id ?? null })
}
