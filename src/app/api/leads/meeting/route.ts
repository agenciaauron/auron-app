import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { MEETING_MISS_REASONS, fromLocalInput } from '@/lib/crm'

type Action = 'realizada' | 'nao_compareceu' | 'desmarcada' | 'confirmar' | 'remarcar'

// Reunião do lead: { leadId, status, reason?, meetingAt? }.
//   realizada       -> aconteceu
//   nao_compareceu  -> faltou (motivo obrigatório)
//   desmarcada      -> o lead desmarcou (motivo obrigatório)
//     Nos dois casos, com meetingAt já fica reagendada; sem, fica em Reunião com selo
//     amarelo e um follow-up "Reagendar a reunião" para agora.
//   confirmar       -> registra que a reunião foi confirmada com o lead
//   remarcar        -> nova data ({ meetingAt }) e volta a ficar agendada
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId } = context
  const { leadId, status, meetingAt, reason } = (await request.json()) as {
    leadId?: string
    status?: Action
    meetingAt?: string
    reason?: string
  }

  if (!leadId || !status || !['realizada', 'nao_compareceu', 'desmarcada', 'confirmar', 'remarcar'].includes(status)) {
    return NextResponse.json({ error: 'Resultado inválido' }, { status: 400 })
  }

  const missed = status === 'nao_compareceu' || status === 'desmarcada'
  const cleanReason = String(reason ?? '').trim()
  if (missed && !MEETING_MISS_REASONS.includes(cleanReason as (typeof MEETING_MISS_REASONS)[number])) {
    return NextResponse.json({ error: 'Escolha o motivo.' }, { status: 400 })
  }

  const nextMeeting = fromLocalInput(meetingAt)
  if (status === 'remarcar' && !nextMeeting) {
    return NextResponse.json({ error: 'Informe a nova data e hora da reunião.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const activities: { type: string; note: string | null }[] = []
  let update: Record<string, unknown> = { updated_at: now }

  if (status === 'realizada') {
    update.meeting_status = 'realizada'
    activities.push({ type: 'reuniao_realizada', note: null })
  } else if (status === 'confirmar') {
    activities.push({ type: 'reuniao_confirmada', note: null })
  } else {
    if (missed) {
      activities.push({ type: status === 'desmarcada' ? 'reuniao_desmarcada' : 'nao_compareceu', note: cleanReason })
    }
    if (nextMeeting) {
      update = { ...update, meeting_at: nextMeeting, meeting_status: 'agendada', next_action_at: null, next_action_note: null }
      activities.push({ type: 'reuniao_remarcada', note: null })
    } else {
      update = {
        ...update,
        meeting_status: status,
        next_action_at: now,
        next_action_note: 'Reagendar a reunião',
      }
    }
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

  await supabase.from('lead_activities').insert(
    activities.map((item) => ({
      company_id: companyId,
      lead_id: leadId,
      user_id: userId,
      type: item.type,
      note: item.note,
    }))
  )

  revalidatePath('/comercial')

  return NextResponse.json({ success: true })
}
