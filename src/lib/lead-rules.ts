import { isMeetingStage } from '@/lib/crm'

type StageInfo = {
  id: string
  name: string
  slug: string | null
  is_won: boolean | null
  is_lost: boolean | null
}

type LeadInfo = {
  stage_id: string | null
  meeting_at: string | null
  meeting_status: string | null
  sdr_id: string | null
  won_at: string | null
}

// O banco devolve "…+00:00" e o navegador manda "…Z": compara pelo instante, não pelo texto.
function sameInstant(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return !a && !b
  return new Date(a).getTime() === new Date(b).getTime()
}

// Campos que mudam quando o lead entra numa etapa: motivo de perda, reunião, data da venda e SDR.
export function stageChangeFields({
  stage,
  lead,
  lostReason,
  meetingAt,
  role,
  userId,
}: {
  stage: StageInfo
  lead: LeadInfo
  lostReason?: unknown
  meetingAt?: string | null
  role: string
  userId: string
}): { fields: Record<string, unknown>; meetingScheduled: boolean; error: string | null } {
  const now = new Date().toISOString()
  const fields: Record<string, unknown> = {}
  const stageChanged = lead.stage_id !== stage.id
  let meetingScheduled = false

  if (stage.is_lost) {
    const reason = String(lostReason ?? '').trim()
    if (!reason) {
      return { fields, meetingScheduled, error: 'Escolha o motivo da perda.' }
    }
    fields.lost_reason = reason
    if (stageChanged) fields.lost_at = now
  } else {
    fields.lost_reason = null
    fields.lost_at = null
  }

  if (isMeetingStage(stage)) {
    const nextMeeting = meetingAt ?? lead.meeting_at
    if (!nextMeeting) {
      return { fields, meetingScheduled, error: 'Informe a data e a hora da reunião.' }
    }
    if (meetingAt && !sameInstant(meetingAt, lead.meeting_at)) {
      fields.meeting_at = meetingAt
      fields.meeting_status = 'agendada'
      meetingScheduled = true
    } else if (!lead.meeting_status) {
      fields.meeting_status = 'agendada'
    }
  } else if (meetingAt !== undefined && !sameInstant(meetingAt, lead.meeting_at)) {
    // Fora da etapa Reunião a data pode ser corrigida ou apagada na ficha.
    fields.meeting_at = meetingAt
    if (!meetingAt) fields.meeting_status = null
  }

  if (stage.is_won) {
    // Entrou agora na venda (ou venda antiga sem data): a data da venda é hoje.
    if (stageChanged || !lead.won_at) fields.won_at = now
  } else {
    fields.won_at = null
  }

  // O SDR que trabalha o lead fica como responsável (é ele quem recebe a comissão).
  if (role === 'sdr' && !lead.sdr_id) {
    fields.sdr_id = userId
  }

  return { fields, meetingScheduled, error: null }
}
