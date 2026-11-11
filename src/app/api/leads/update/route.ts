import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { fromLocalInput, isManager, normalizeOrigin } from '@/lib/crm'
import { stageChangeFields } from '@/lib/lead-rules'
import { syncMetaEvent } from '@/lib/meta-events'

export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId, role } = context
  const body = await request.json()

  const {
    leadId,
    name,
    phone,
    email,
    source,
    campaign,
    notes,
    saleValue,
    stageId,
    lostReason,
    origin,
    sdrId,
    nextActionAt,
    nextActionNote,
    meetingAt,
    strict,
  } = body

  if (!leadId || !name?.trim()) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
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

  const parsedSaleValue =
    saleValue === '' || saleValue == null
      ? null
      : Number(saleValue)

  if (parsedSaleValue !== null && Number.isNaN(parsedSaleValue)) {
    return NextResponse.json({ error: 'Valor da venda inválido' }, { status: 400 })
  }

  const change = stageChangeFields({
    stage,
    lead,
    lostReason,
    meetingAt: meetingAt === undefined ? undefined : fromLocalInput(meetingAt),
    role,
    userId,
    strict: Boolean(strict),
  })

  if (change.error) {
    return NextResponse.json({ error: change.error }, { status: 400 })
  }

  // Só dono/administrador troca o SDR responsável (define quem recebe a comissão).
  const sdrFields: Record<string, unknown> = {}
  if (isManager(role) && sdrId !== undefined) {
    sdrFields.sdr_id = sdrId || null
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      source: source?.trim() || null,
      campaign: campaign?.trim() || null,
      notes: notes?.trim() || null,
      sale_value: stage.is_won ? parsedSaleValue : null,
      stage_id: stageId,
      ...(origin !== undefined ? { origin: normalizeOrigin(origin) } : {}),
      ...(nextActionAt !== undefined
        ? {
            next_action_at: fromLocalInput(nextActionAt),
            next_action_note: fromLocalInput(nextActionAt) ? String(nextActionNote ?? '').trim() || null : null,
          }
        : {}),
      ...change.fields,
      ...sdrFields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select('id')

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

  const meta = await syncMetaEvent({
    supabase,
    leadId,
    stageName: stage.name,
    isWon: Boolean(stage.is_won),
    isLost: Boolean(stage.is_lost),
    saleValue: stage.is_won ? parsedSaleValue : null,
  })

  return NextResponse.json({ success: true, meta })
}
