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
}

// Atividades que o SDR registra pelos botões rápidos.
export const QUICK_ACTIVITIES: ActivityType[] = ['ligacao', 'mensagem', 'nao_atendeu', 'nota']

// Etapa "Sem resposta": contam como tentativa as mensagens/ligações feitas depois da última
// mensagem do lead. A partir do limite, o CRM sugere desqualificar com "Não respondeu".
export const NO_REPLY_STAGE_SLUG = 'sem-resposta'
export const NO_REPLY_ATTEMPT_LIMIT = 4
const ATTEMPT_TYPES = new Set(['mensagem', 'ligacao', 'nao_atendeu'])

export function noReplyAttempts(
  lead: { id: string; created_at: string; last_message_at?: string | null },
  activities: { lead_id: string; type: string; created_at: string }[]
) {
  const since = new Date(lead.last_message_at ?? lead.created_at).getTime()
  return activities.filter(
    (item) =>
      item.lead_id === lead.id &&
      ATTEMPT_TYPES.has(item.type) &&
      new Date(item.created_at).getTime() > since
  ).length
}

// Cor que o SDR marca no lead em "Sem resposta" para se organizar.
export type NoReplyTag = 'nunca_respondeu' | 'parou_de_responder' | 'faltou_reuniao'

export const NO_REPLY_TAGS: {
  value: NoReplyTag
  label: string
  color: string
  dot: string
  card: string
  chip: string
}[] = [
  {
    value: 'nunca_respondeu',
    label: 'Nunca respondeu',
    color: 'Vermelho',
    dot: 'bg-red-500',
    card: 'border-red-500/70',
    chip: 'bg-red-500/15 text-red-300',
  },
  {
    value: 'parou_de_responder',
    label: 'Parou de responder',
    color: 'Laranja',
    dot: 'bg-orange-500',
    card: 'border-orange-500/70',
    chip: 'bg-orange-500/15 text-orange-300',
  },
  {
    value: 'faltou_reuniao',
    label: 'Faltou na reunião',
    color: 'Amarelo',
    dot: 'bg-yellow-400',
    card: 'border-yellow-400/70',
    chip: 'bg-yellow-400/15 text-yellow-200',
  },
]

export function noReplyTagInfo(value: string | null | undefined) {
  return NO_REPLY_TAGS.find((tag) => tag.value === value) ?? null
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
