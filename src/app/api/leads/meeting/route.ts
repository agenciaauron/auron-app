import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { fromLocalInput } from '@/lib/crm'

type Action = 'realizada' | 'nao_compareceu' | 'confirmar' | 'remarcar'

// Reunião do lead: { leadId, status }.
//   realizada       -> aconteceu
//   nao_compareceu  -> faltou: fica em Reunião com selo amarelo e follow-up "remarcar" para agora
//   confirmar       -> registra que a reunião foi confirmada com o lead
//   remarcar        -> nova data ({ meetingAt }) e volta a ficar agendada
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId } = context
  const { leadId, status, meetingAt } = (await request.json()) as {
    leadId?: string
    status?: Action
    meetingAt?: string
  }

  if (!leadId || !status || !['realizada', 'nao_compareceu', 'confirmar', 'remarcar'].includes(status)) {
    return NextResponse.json({ error: 'Resultado inválido' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let update: Record<string, unknown> = { updated_at: now }
  let activity: string

  if (status === 'remarcar') {
    const nextMeeting = fromLocalInput(meetingAt)
    if (!nextMeeting) {
      return NextResponse.json({ error: 'Informe a nova data e hora da reunião.' }, { status: 400 })
    }
    update = { ...update, meeting_at: nextMeeting, meeting_status: 'agendada', next_action_at: null, next_action_note: null }
    activity = 'reuniao_remarcada'
  } else if (status === 'confirmar') {
    activity = 'reuniao_confirmada'
  } else if (status === 'nao_compareceu') {
    update = {
      ...update,
      meeting_status: 'nao_compareceu',
      next_action_at: now,
      next_action_note: 'Remarcar a reunião (faltou)',
    }
    activity = 'nao_compareceu'
  } else {
    update = { ...update, meeting_status: 'realizada' }
    activity = 'reuniao_realizada'
  }

  const { data, error } = await supabase
    .from('leads')
    .update(update)
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
    type: activity,
    note: null,
  })

  revalidatePath('/comercial')

  return NextResponse.json({ success: true })
}
