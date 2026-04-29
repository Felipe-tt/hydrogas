import {
  FirebaseApartmentRepository,
  FirebaseReadingRepository,
  FirebaseConfigRepository,
} from '../infrastructure/firebase'
import { ReadingUseCases } from '../domain/usecases/ReadingUseCases'

export const apartmentRepo  = new FirebaseApartmentRepository()
export const readingRepo     = new FirebaseReadingRepository()
export const configRepo      = new FirebaseConfigRepository()
export const readingUseCases = new ReadingUseCases(readingRepo, configRepo)
