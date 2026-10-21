export const LOST_REASONS = [
  'Não respondeu',
  'Sem verba',
  'Fora do perfil',
  'Só curiosidade',
  'Fechou com outro',
  'Outro',
] as const

export const IDLE_DAYS_DEFAULT = 3

// Novo lead e Desqualificado mostram só leads ativos nesse período; o resto fica recolhido.
export const RECENT_DAYS = 10

// Última atividade do lead: a mensagem mais recente dele ou a entrada no CRM.
export function lastActivity(lead: {
  created_at: string
  last_message_at?: string | null
}) {
  const created = new Date(lead.created_at).getTime()
  const message = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0
  return Math.max(created, message)
}

export function idleDays(
  lead: { created_at: string; last_message_at?: string | null },
  now = Date.now()
) {
  return Math.floor((now - lastActivity(lead)) / 86400000)
}

export function idleLabel(days: number) {
  if (days <= 0) return 'hoje'
  if (days === 1) return 'há 1 dia'
  return `há ${days} dias`
}

export type Heat = 'hot' | 'warm' | 'cool' | 'cold'

// Temperatura do lead pela última atividade: hoje, até 3 dias, até 10 dias, parado.
export function leadHeat(days: number): Heat {
  if (days <= 0) return 'hot'
  if (days < IDLE_DAYS_DEFAULT) return 'warm'
  if (days < RECENT_DAYS) return 'cool'
  return 'cold'
}

// 554384482399 -> (43) 98448-2399. Números fora do padrão brasileiro ficam como estão.
export function formatPhone(raw: string | null | undefined) {
  if (!raw) return ''
  let digits = raw.replace(/\D/g, '')
  if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2)

  // WhatsApp costuma omitir o 9 do celular: 43 8448-2399 -> 43 98448-2399
  if (digits.length === 10 && /[6-9]/.test(digits[2])) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return raw
}

export function whatsappUrl(raw: string | null | undefined) {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
}
