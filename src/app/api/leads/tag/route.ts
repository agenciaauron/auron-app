import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { NO_REPLY_STAGE_SLUG, NO_REPLY_TAGS } from '@/lib/crm'

// Cor do lead em "Sem resposta": { leadId, tag: 'nunca_respondeu' | 'parou_de_responder' | 'faltou_reuniao' | null }.
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, companyId } = context
  const { leadId, tag } = await request.json()

  if (!leadId || (tag !== null && !NO_REPLY_TAGS.some((item) => item.value === tag))) {
    return NextResponse.json({ error: 'Cor inválida' }, { status: 400 })
  }

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('company_id', companyId)
    .eq('slug', NO_REPLY_STAGE_SLUG)
    .maybeSingle()

  if (!stage) {
    return NextResponse.json({ error: 'Etapa "Sem resposta" não encontrada.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ no_reply_tag: tag, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .eq('stage_id', stage.id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data?.length) {
    return NextResponse.json({ error: 'A cor só pode ser marcada em leads da etapa "Sem resposta".' }, { status: 404 })
  }

  revalidatePath('/comercial')

  return NextResponse.json({ success: true })
}
