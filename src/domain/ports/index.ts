import type { Apartment, Config, Reading, UtilityType } from '../entities'

export interface IApartmentRepository {
  getAll(): Promise<Apartment[]>
  getById(id: string): Promise<Apartment | null>
  create(data: Omit<Apartment, 'id' | 'createdAt'>): Promise<Apartment>
  update(id: string, data: Partial<Apartment>): Promise<void>
  delete(id: string): Promise<void>
  subscribe(cb: (apartments: Apartment[]) => void): () => void
}

export interface IReadingRepository {
  getByApartment(apartmentId: string): Promise<Reading[]>
  getByMonthYear(month: number, year: number): Promise<Reading[]>
  getAll(): Promise<Reading[]>
  create(data: Omit<Reading, 'id' | 'createdAt'>): Promise<Reading>
  update(id: string, data: Partial<Reading>): Promise<void>
  delete(id: string): Promise<void>
  subscribe(cb: (readings: Reading[]) => void): () => void
}

export interface IConfigRepository {
  get(): Promise<Config>
  update(data: Partial<Config>): Promise<void>
  subscribe(cb: (config: Config) => void): () => void
}
