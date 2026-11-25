// Financeiro por processo (pedido do Rafael, 25/11/2026).

export type FinanceChannel = 'trafego' | 'indicacao' | 'prospeccao' | 'organico'

export const FINANCE_CHANNELS: FinanceChannel[] = ['trafego', 'indicacao', 'prospeccao', 'organico']

export const CHANNEL_LABELS: Record<FinanceChannel, string> = {
  trafego: 'Tráfego pago',
  indicacao: 'Indicação',
  prospeccao: 'Prospecção ativa',
  organico: 'Orgânico',
}

export function isFinanceChannel(value: unknown): value is FinanceChannel {
  return typeof value === 'string' && (FINANCE_CHANNELS as string[]).includes(value)
}
