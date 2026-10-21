export const LOST_REASONS = [
  'Não respondeu',
  'Sem verba',
  'Fora do perfil',
  'Só curiosidade',
  'Fechou com outro',
  'Outro',
] as const

export const IDLE_DAYS_DEFAULT = 3

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
