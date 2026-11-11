import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { fromLocalInput } from '@/lib/crm'
import { stageChangeFields } from '@/lib/lead-rules'
import { syncMetaEvent } from '@/lib/meta-events'

export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId, role } = context
  const { leadId, stageId, lostReason, meetingAt, strict } = await request.json()

  if (!leadId || !stageId) {
    return NextResponse.json({ error: 'Lead ou etapa inválida' }, { status: 400 })
  }

  const [{ data: stage }, { data: lead }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, name, slug, is_won, is_lost')
      .eq('id', stageId)
      .eq('company_id', companyId)
      .single(),
    supabase
      .from('leads')
      .select('id, stage_id, meeting_at, meeting_status, sdr_id, won_at')
      .eq('id', leadId)
      .eq('company_id', companyId)
      .single(),
  ])

  if (!stage) {
    return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
  }

  if (!lead) {
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  const change = stageChangeFields({
    stage,
    lead,
    lostReason,
    meetingAt: meetingAt === undefined ? undefined : fromLocalInput(meetingAt) ?? null,
    role,
    userId,
    strict: Boolean(strict),
  })

  if (change.error) {
    return NextResponse.json({ error: change.error, needs: stage.is_lost ? 'lost_reason' : 'meeting_at' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      stage_id: stageId,
      updated_at: new Date().toISOString(),
      ...change.fields,
    })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select('id, sale_value')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data?.length) {
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  if (change.meetingScheduled) {
    await supabase.from('lead_activities').insert({
      company_id: companyId,
      lead_id: leadId,
      user_id: userId,
      type: 'reuniao_marcada',
      note: null,
    })
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  revalidatePath('/sdr')

  const saleValue = data[0].sale_value == null ? null : Number(data[0].sale_value)
  const meta = await syncMetaEvent({
    supabase,
    leadId,
    stageName: stage.name,
    isWon: Boolean(stage.is_won),
    isLost: Boolean(stage.is_lost),
    saleValue,
  })

  return NextResponse.json({ success: true, meta })
}
