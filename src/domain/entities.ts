export interface Apartment {
  id: string
  number: string
  block?: string
  responsible?: string
  observation?: string
  createdAt: number
  active: boolean
  publicToken?: string
  /** Hash Argon2id da senha do morador. Nunca armazene a senha plain text. */
  accessPasswordHash?: string
}

export type UtilityType = 'water' | 'gas'

export interface Reading {
  id: string
  apartmentId: string
  type: UtilityType
  month: number   // 1-12
  year: number
  startValue: number
  endValue?: number
  consumption?: number
  totalCost?: number
  closedAt?: number
  createdAt: number
  /** Criada automaticamente ao fechar o mês anterior — não conta como pendente até o usuário agir */
  autoCreated?: boolean
}

export interface Config {
  waterRate: number        // default 0.033
  gasRate: number          // default 0.033
  condominiumName: string
  managerName?: string     // Nome do síndico
  managerPhone?: string    // Telefone/WhatsApp do síndico
  address?: string         // Endereço do condomínio
  updatedAt: number
}

export interface MonthSummary {
  apartmentId: string
  apartmentNumber: string
  month: number
  year: number
  waterConsumption?: number
  waterCost?: number
  gasConsumption?: number
  gasCost?: number
  totalCost: number
}
