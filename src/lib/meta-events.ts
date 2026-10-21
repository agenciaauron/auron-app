type MetaEventName = 'QualifiedLead' | 'Purchase'

type MetaSyncResult = {
  ok: boolean
  status?: 'sent' | 'already_sent' | 'waiting_value' | 'not_eligible' | 'error'
  event_name?: MetaEventName
  event_id?: string | null
  sent_at?: string | null
  dataset_id?: string | null
  message?: string
  error?: string
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export async function syncMetaEvent({
  supabase,
  leadId,
  stageName,
  isWon,
  isLost = false,
  saleValue,
}: {
  supabase: any
  leadId: string
  stageName: string
  isWon: boolean
  isLost?: boolean
  saleValue?: number | null
}): Promise<MetaSyncResult | null> {
  let eventName: MetaEventName | null = null

  // Etapas de perda (ex.: "Desqualificado") nunca geram evento, mesmo contendo "qualific".
  if (isLost) return null

  if (isWon) {
    eventName = 'Purchase'
  } else if (normalize(stageName).includes('qualific')) {
    eventName = 'QualifiedLead'
  }

  if (!eventName) return null

  if (eventName === 'Purchase' && (!saleValue || saleValue <= 0)) {
    return {
      ok: true,
      status: 'waiting_value',
      event_name: eventName,
      message: 'Informe o valor da venda para enviar Purchase à Meta.',
    }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    return {
      ok: false,
      status: 'error',
      event_name: eventName,
      error: 'Sessão do CRM indisponível para enviar o evento à Meta.',
    }
  }

  try {
    const baseUrl = process.env.AURON_CONVERSOES_URL || 'https://www.auronmarketing.com.br'
    const response = await fetch(`${baseUrl}/api/crm-meta-event`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: leadId,
        event_name: eventName,
        ...(eventName === 'Purchase' ? { value: saleValue } : {}),
      }),
    })

    const result = (await response.json()) as MetaSyncResult

    if (!response.ok) {
      return {
        ...result,
        ok: false,
        status: 'error',
        event_name: eventName,
      }
    }

    return result
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      event_name: eventName,
      error: error instanceof Error ? error.message : 'Falha ao enviar evento à Meta.',
    }
  }
}
