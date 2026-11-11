// Formatos de lead, etapa, histórico e atividade usados pelas telas.

export type Stage = {
  id: string
  name: string
  slug: string | null
  position: number
  is_won: boolean
  is_lost: boolean
  pipeline: string | null
}

export type Lead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  campaign: string | null
  notes: string | null
  stage_id: string | null
  sale_value: number | string | null
  created_at: string
  last_message: string | null
  last_message_at: string | null
  lost_reason: string | null
  integration_source: string | null
  ctwa_clid: string | null
  meta_qualified_sent_at: string | null
  meta_purchase_sent_at: string | null
  meta_last_error: string | null
  meta_last_error_at: string | null
  origin: string | null
  sdr_id: string | null
  next_action_at: string | null
  next_action_note: string | null
  meeting_at: string | null
  meeting_status: string | null
  won_at: string | null
}

export type HistoryItem = {
  id: string
  lead_id: string
  user_id?: string | null
  event_type: string
  from_stage_id: string | null
  to_stage_id: string | null
  created_at: string
}

export type Activity = {
  id: string
  lead_id: string
  user_id: string | null
  type: string
  note: string | null
  created_at: string
}

export const STAGE_SELECT = 'id, name, slug, position, is_won, is_lost, pipeline'

export const LEAD_SELECT =
  'id, name, phone, email, source, campaign, notes, stage_id, sale_value, created_at, last_message, last_message_at, lost_reason, integration_source, ctwa_clid, meta_qualified_sent_at, meta_purchase_sent_at, meta_last_error, meta_last_error_at, origin, sdr_id, next_action_at, next_action_note, meeting_at, meeting_status, won_at'

export const HISTORY_SELECT = 'id, lead_id, user_id, event_type, from_stage_id, to_stage_id, created_at'

export const ACTIVITY_SELECT = 'id, lead_id, user_id, type, note, created_at'
