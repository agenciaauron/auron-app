import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireApiContext } from '@/lib/crm-context'
import { CONVERSATION_KINDS, type ConversationKind } from '@/lib/crm'

// SDR corrige o selo da conversa: { leadId, kind: ConversationKind | null }.
// null volta para o automático. A correção vale até a conversa andar
// (nova mensagem do lead ou nova tentativa registrada depois dela).
export async function PATCH(request: Request) {
  const { context, error: contextError } = await requireApiContext()
  if (contextError) return contextError

  const { supabase, companyId } = context
  const { leadId, kind } = (await request.json()) as { leadId?: string; kind?: ConversationKind | null }

  if (!leadId || (kind !== null && !CONVERSATION_KINDS.includes(kind as ConversationKind))) {
    return NextResponse.json({ error: 'Selo inválido' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('leads')
    .update({
      conversation_override: kind,
      conversation_override_at: kind ? now : null,
      updated_at: now,
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

  revalidatePath('/comercial')

  return NextResponse.json({ success: true, at: kind ? now : null })
}
