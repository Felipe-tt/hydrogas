import type { IReadingRepository, IConfigRepository } from '../ports'
import type { Reading, UtilityType, MonthSummary } from '../entities'

export class ReadingUseCases {
  constructor(
    private readingRepo: IReadingRepository,
    private configRepo: IConfigRepository,
  ) {}

  async openReading(
    apartmentId: string,
    type: UtilityType,
    month: number,
    year: number,
    startValue: number,
  ): Promise<Reading> {
    const existing = await this.readingRepo.getByMonthYear(month, year)

    // Bloqueia leitura aberta duplicada
    const dup = existing.find(
      r => r.apartmentId === apartmentId && r.type === type && !r.closedAt,
    )
    if (dup) throw new Error('Já existe uma leitura aberta para este apartamento/mês/tipo.')

    // Bloqueia segunda leitura fechada do mesmo tipo no mesmo mês
    const alreadyClosed = existing.find(
      r => r.apartmentId === apartmentId && r.type === type && !!r.closedAt,
    )
    const typeLabel = type === 'water' ? 'água' : 'gás'
    if (alreadyClosed) throw new Error(`Já existe uma leitura de ${typeLabel} fechada para este apartamento neste mês. Só é permitida uma leitura por tipo por mês.`)

    return this.readingRepo.create({ apartmentId, type, month, year, startValue })
  }

  async closeReading(readingId: string, endValue: number): Promise<void> {
    const config = await this.configRepo.get()
    const all = await this.readingRepo.getAll()
    const reading = all.find(r => r.id === readingId)
    if (!reading) throw new Error('Leitura não encontrada.')
    if (endValue < reading.startValue)
      throw new Error('Valor final não pode ser menor que o inicial.')

    // Verifica se já existe uma leitura fechada do mesmo tipo/mês/apartamento
    const alreadyClosed = all.find(
      r => r.id !== readingId
        && r.apartmentId === reading.apartmentId
        && r.type === reading.type
        && r.month === reading.month
        && r.year === reading.year
        && !!r.closedAt,
    )
    if (alreadyClosed) {
      const typeLabel = reading.type === 'water' ? 'água' : 'gás'
      throw new Error(`Já existe uma leitura de ${typeLabel} fechada para este apartamento neste mês.`)
    }

    const consumption = endValue - reading.startValue
    const rate = reading.type === 'water' ? config.waterRate : config.gasRate
    const totalCost = consumption * rate

    await this.readingRepo.update(readingId, {
      endValue,
      consumption,
      totalCost,
      closedAt: Date.now(),
    })

    // ── Cria automaticamente a leitura inicial do mês seguinte ──────────────
    // A leitura final deste mês torna-se a leitura inicial do próximo, evitando
    // que o usuário precise digitá-la novamente.
    const nextMonth = reading.month === 12 ? 1  : reading.month + 1
    const nextYear  = reading.month === 12 ? reading.year + 1 : reading.year

    const nextMonthReadings = await this.readingRepo.getByMonthYear(nextMonth, nextYear)

    // Só cria se não existir nenhuma leitura (aberta ou fechada) deste tipo/ap no próximo mês
    const alreadyExistsNext = nextMonthReadings.some(
      r => r.apartmentId === reading.apartmentId && r.type === reading.type,
    )

    if (!alreadyExistsNext) {
      await this.readingRepo.create({
        apartmentId: reading.apartmentId,
        type:        reading.type,
        month:       nextMonth,
        year:        nextYear,
        startValue:  endValue,
      })
    }
  }

  async getMonthlySummary(month: number, year: number): Promise<MonthSummary[]> {
    const readings = await this.readingRepo.getByMonthYear(month, year)
    const map = new Map<string, MonthSummary>()

    for (const r of readings) {
      if (!r.closedAt) continue
      const existing = map.get(r.apartmentId) ?? {
        apartmentId: r.apartmentId,
        apartmentNumber: '',
        month,
        year,
        totalCost: 0,
      }
      if (r.type === 'water') {
        existing.waterConsumption = r.consumption
        existing.waterCost = r.totalCost
      } else {
        existing.gasConsumption = r.consumption
        existing.gasCost = r.totalCost
      }
      existing.totalCost = (existing.waterCost ?? 0) + (existing.gasCost ?? 0)
      map.set(r.apartmentId, existing)
    }
    return Array.from(map.values())
  }
}
