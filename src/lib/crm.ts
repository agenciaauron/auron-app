// Regras e textos compartilhados do CRM (perfis, frentes, atividades, comissão).

export type CrmRole = 'owner' | 'admin' | 'member' | 'sdr'
export type LeadOrigin = 'trafego' | 'prospeccao'
export type StagePipeline = 'trafego' | 'prospeccao' | 'ambos'
export type MeetingStatus = 'agendada' | 'realizada' | 'nao_compareceu'
export type ActivityType =
  | 'ligacao'
  | 'mensagem'
  | 'nao_atendeu'
  | 'reuniao_marcada'
  | 'reuniao_realizada'
  | 'nao_compareceu'
  | 'nota'
  | 'reuniao_confirmada'
  | 'reuniao_remarcada'

export type TeamMember = {
  user_id: string
  role: string
  name: string
}

// Dono e administrador veem financeiro, gasto de anúncios e podem excluir leads.
export function isManager(role: string | null | undefined) {
  return role === 'owner' || role === 'admin'
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Sócio',
  admin: 'Administrador',
  member: 'Equipe',
  sdr: 'SDR',
}

export const ORIGIN_LABELS: Record<LeadOrigin, string> = {
  trafego: 'Tráfego',
  prospeccao: 'Prospecção',
}

// Comissão do SDR sobre a 1ª mensalidade (valor da venda).
export const COMMISSION_RATES: Record<LeadOrigin, number> = {
  prospeccao: 0.1,
  trafego: 0.05,
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  ligacao: 'Ligou',
  mensagem: 'Mandou mensagem',
  nao_atendeu: 'Não atendeu',
  reuniao_marcada: 'Reunião marcada',
  reuniao_realizada: 'Reunião aconteceu',
  nao_compareceu: 'Não compareceu à reunião',
  nota: 'Anotação',
  reuniao_confirmada: 'Confirmou a reunião',
  reuniao_remarcada: 'Remarcou a reunião',
}

// Atividades que o SDR registra pelos botões rápidos.
export const QUICK_ACTIVITIES: ActivityType[] = ['ligacao', 'mensagem', 'nao_atendeu', 'nota']

// "Em conversa": a etapa única de quem já recebeu contato. O CRM calcula sozinho de quem é a vez.
export const CONVERSATION_STAGE_SLUG = 'em-contato'
export const ENTRY_STAGE_SLUG = 'novo-lead'
export const QUALIFIED_STAGE_SLUG = 'qualificado'

// Depois de 4 tentativas sem resposta (e 2 dias de silêncio), o banco desqualifica sozinho
// às 9h com "Não respondeu". Se o lead responder depois, o webhook devolve para "Em conversa".
export const NO_REPLY_ATTEMPT_LIMIT = 4
// Quem faltou 2 vezes na reunião: o CRM sugere desqualificar.
export const NO_SHOW_LIMIT = 2
// Sem resposta há mais que isso: o selo fica vermelho (nunca respondeu) ou laranja (parou).
const STALE_MS = 24 * 3600000
// Cadência do follow-up: depois da 1ª tentativa, +1 dia; da 2ª, +2 dias; da 3ª, +4 dias.
const FOLLOW_UP_DAYS = [1, 2, 4]

export const ATTEMPT_TYPES = new Set(['mensagem', 'ligacao', 'nao_atendeu'])

type LeadTimes = { id: string; created_at: string; last_message_at?: string | null }
type ActivityTimes = { lead_id: string; type: string; created_at: string }

// Tentativas (mensagem/ligação/não atendeu) depois da última mensagem do lead.
export function noReplyAttempts(lead: LeadTimes, activities: ActivityTimes[]) {
  const since = new Date(lead.last_message_at ?? lead.created_at).getTime()
  return activities.filter(
    (item) =>
      item.lead_id === lead.id &&
      ATTEMPT_TYPES.has(item.type) &&
      new Date(item.created_at).getTime() > since
  ).length
}

// Arrastar o card para "Em conversa" (ou para o antigo "Sem resposta") também conta como contato:
// muita mensagem é mandada direto no WhatsApp sem registrar no CRM.
const CONTACT_STAGE_SLUGS = new Set([CONVERSATION_STAGE_SLUG, 'sem-resposta'])

export function withStageTouches(
  activities: ActivityTimes[],
  history: { lead_id: string; to_stage_id: string | null; created_at: string; event_type?: string; user_id?: string | null }[],
  stages: { id: string; slug: string | null }[]
): ActivityTimes[] {
  const contactStageIds = new Set(
    stages.filter((stage) => stage.slug && CONTACT_STAGE_SLUGS.has(stage.slug)).map((stage) => stage.id)
  )
  const touches = history
    // Só movimento feito por alguém da equipe (o webhook/sistema move sem usuário quando o lead responde).
    .filter(
      (item) =>
        item.event_type !== 'created' && item.user_id && item.to_stage_id && contactStageIds.has(item.to_stage_id)
    )
    .map((item) => ({ lead_id: item.lead_id, type: 'mensagem', created_at: item.created_at }))
  return touches.length ? [...activities, ...touches] : activities
}

// Próximo follow-up depois da tentativa número `attempt` (contando a que acabou de ser feita).
export function suggestedFollowUp(attempt: number, now = Date.now()) {
  const days = FOLLOW_UP_DAYS[attempt - 1]
  if (!days) return null
  return {
    at: new Date(now + days * 86400000).toISOString(),
    note: `Follow-up ${attempt + 1} de ${NO_REPLY_ATTEMPT_LIMIT}`,
  }
}

export type ConversationKind =
  | 'sua_vez'
  | 'aguardando'
  | 'nunca_respondeu'
  | 'parou_de_responder'
  | 'faltou_reuniao'

// Selo do card: vermelho = nunca respondeu, laranja = parou de responder,
// amarelo = faltou na reunião, verde = o lead respondeu e é a sua vez.
export const CONVERSATION_BADGES: Record<
  ConversationKind,
  { label: string; dot: string; card: string; chip: string }
> = {
  sua_vez: {
    label: 'Sua vez',
    dot: 'bg-emerald-400',
    card: 'border-emerald-500/50',
    chip: 'bg-emerald-500/15 text-emerald-300',
  },
  aguardando: {
    label: 'Aguardando',
    dot: 'bg-ink-500',
    card: 'border-ink-800/80',
    chip: 'bg-ink-800 text-ink-300',
  },
  nunca_respondeu: {
    label: 'Nunca respondeu',
    dot: 'bg-red-500',
    card: 'border-red-500/60',
    chip: 'bg-red-500/15 text-red-300',
  },
  parou_de_responder: {
    label: 'Parou de responder',
    dot: 'bg-orange-500',
    card: 'border-orange-500/60',
    chip: 'bg-orange-500/15 text-orange-300',
  },
  faltou_reuniao: {
    label: 'Faltou na reunião',
    dot: 'bg-yellow-400',
    card: 'border-yellow-400/60',
    chip: 'bg-yellow-400/15 text-yellow-200',
  },
}

export type ConversationStatus = {
  kind: ConversationKind
  text: string
  attempts: number
  noShows: number
}

// De quem é a vez na conversa, calculado pelas mensagens do lead e pelas tentativas registradas.
export function conversationStatus(
  lead: LeadTimes & { meeting_status?: string | null },
  activities: ActivityTimes[],
  now = Date.now()
): ConversationStatus | null {
  const own = activities.filter((item) => item.lead_id === lead.id)
  const noShows = own.filter((item) => item.type === 'nao_compareceu').length

  if (lead.meeting_status === 'nao_compareceu') {
    return {
      kind: 'faltou_reuniao',
      text: noShows >= NO_SHOW_LIMIT ? `Faltou ${noShows}x · desqualificar?` : 'Faltou na reunião · remarcar',
      attempts: 0,
      noShows,
    }
  }

  if (lead.meeting_status === 'agendada') return null

  const attemptTimes = own
    .filter((item) => ATTEMPT_TYPES.has(item.type))
    .map((item) => new Date(item.created_at).getTime())
  const inbound = lead.last_message_at ? new Date(lead.last_message_at).getTime() : null

  if (attemptTimes.length === 0) {
    return inbound ? { kind: 'sua_vez', text: 'Mandou mensagem · sua vez', attempts: 0, noShows } : null
  }

  const lastAttempt = Math.max(...attemptTimes)
  const firstAttempt = Math.min(...attemptTimes)

  if (inbound && inbound > lastAttempt) {
    return { kind: 'sua_vez', text: 'Respondeu · sua vez', attempts: 0, noShows }
  }

  const attempts = noReplyAttempts(lead, activities)
  const count = `${attempts} de ${NO_REPLY_ATTEMPT_LIMIT}`

  if (now - lastAttempt < STALE_MS) {
    return { kind: 'aguardando', text: `Aguardando resposta · ${count}`, attempts, noShows }
  }

  const replied = inbound !== null && inbound > firstAttempt
  return replied
    ? { kind: 'parou_de_responder', text: `Parou de responder · ${count}`, attempts, noShows }
    : { kind: 'nunca_respondeu', text: `Nunca respondeu · ${count}`, attempts, noShows }
}

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  agendada: 'Agendada',
  realizada: 'Aconteceu',
  nao_compareceu: 'Não compareceu',
}

export function isMeetingStage(stage: { slug?: string | null; name?: string | null } | null | undefined) {
  if (!stage) return false
  const value = `${stage.slug ?? ''} ${stage.name ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  return value.includes('reuniao')
}

export function stageBelongsTo(
  stage: { pipeline?: string | null },
  origin: LeadOrigin
) {
  const pipeline = stage.pipeline ?? 'ambos'
  return pipeline === 'ambos' || pipeline === origin
}

export function normalizeOrigin(value: unknown): LeadOrigin {
  return value === 'prospeccao' ? 'prospeccao' : 'trafego'
}

export function formatCurrency(value: number | string | null | undefined) {
  if (value == null || value === '') return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  )
}

// Valor para <input type="datetime-local"> no fuso de quem está usando.
export function toLocalInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

// "2026-11-12T14:30" (hora local) -> ISO em UTC.
export function fromLocalInput(value: FormDataEntryValue | string | null | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export type DueState = 'overdue' | 'today' | 'future'

export function dueState(value: string, now = Date.now()): DueState {
  const date = new Date(value)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(startOfToday)
  endOfToday.setDate(endOfToday.getDate() + 1)

  if (date.getTime() < now && date < startOfToday) return 'overdue'
  if (date < endOfToday) return date.getTime() < now ? 'overdue' : 'today'
  return 'future'
}

export function dueLabel(value: string, now = Date.now()) {
  const date = new Date(value)
  const state = dueState(value, now)
  const time = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(date)

  if (state === 'today') return `Hoje, ${time}`

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.round((startOfToday.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86400000)

  if (state === 'overdue') {
    if (days <= 0) return `Atrasado desde ${time}`
    if (days === 1) return `Atrasado desde ontem`
    return `Atrasado há ${days} dias`
  }

  if (days === -1) return `Amanhã, ${time}`
  return formatDateTime(value)
}
