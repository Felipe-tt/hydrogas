export interface Apartment {
  id: string
  number: string
  block?: string
  responsible?: string
  observation?: string
  createdAt: number
  active: boolean
  publicToken?: string
  accessPassword?: string
}

export type UtilityType = 'water' | 'gas'

export interface Reading {
  id: string
  apartmentId: string
  type: UtilityType
  month: number
  year: number
  startValue: number
  endValue?: number
  consumption?: number
  totalCost?: number
  closedAt?: number
  createdAt: number
}

export interface Config {
  waterRate: number
  gasRate: number
  condominiumName: string
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
