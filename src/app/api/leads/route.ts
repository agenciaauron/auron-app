import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { fromLocalInput, normalizeOrigin, stageBelongsTo } from '@/lib/crm'

// Últimos 8 dígitos: casa (43) 99911-9053, 5543999119053 e 554399119053.
function phoneKey(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(-8) : null
}

export async function POST(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, userId, companyId, role } = context
  const body = await request.json()
  const { name, phone, email, source, campaign, nextActionAt, nextActionNote, force, checkDuplicate } = body
  const origin = normalizeOrigin(body.origin)

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  // Evita abordar a mesma empresa duas vezes.
  const key = phoneKey(phone)
  if (key && checkDuplicate && !force) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, name, phone, wa_id')
      .eq('company_id', companyId)

    const duplicate = (existing ?? []).find(
      (lead) => phoneKey(lead.phone) === key || phoneKey(lead.wa_id) === key
    )

    if (duplicate) {
      return NextResponse.json(
        {
          error: `Esse telefone já está no CRM como "${duplicate.name}".`,
          duplicate: true,
        },
        { status: 409 }
      )
    }
  }

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline, position, is_won, is_lost')
    .eq('company_id', companyId)
    .order('position')

  const firstStage = (stages ?? []).find(
    (stage) => !stage.is_won && !stage.is_lost && stageBelongsTo(stage, origin)
  )

  if (!firstStage) {
    return NextResponse.json({ error: 'Etapa inicial não encontrada' }, { status: 400 })
  }

  const nextAction = fromLocalInput(nextActionAt)

  const { error } = await supabase
    .from('leads')
    .insert({
      company_id: companyId,
      stage_id: firstStage.id,
      assigned_to: userId,
      origin,
      sdr_id: role === 'sdr' ? userId : null,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      source: source?.trim() || (origin === 'prospeccao' ? 'Prospecção' : null),
      campaign: campaign?.trim() || null,
      next_action_at: nextAction,
      next_action_note: nextAction ? String(nextActionNote ?? '').trim() || null : null,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/comercial')

  return NextResponse.json({ success: true })
}
