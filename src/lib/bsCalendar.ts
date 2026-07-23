// Bikram Sambat (BS) <-> Gregorian (AD) date helpers.
//
import { ADToBS, BSToAD } from 'bikram-sambat-js'
import type { BsMonth } from '../types/database'

export const BS_MONTHS: BsMonth[] = [
  'Shrawan', 'Bhadra', 'Ashoj', 'Karthik', 'Mangsir', 'Poush',
  'Magh', 'Falgun', 'Chaitra', 'Baishak', 'Jestha', 'Ashar',
]

export interface BsDate {
  bs_year: number
  bs_month: BsMonth
  bs_day: number
}

const BS_MONTH_NUMBER: Record<BsMonth, number> = {
  Baishak: 1,
  Jestha: 2,
  Ashar: 3,
  Shrawan: 4,
  Bhadra: 5,
  Ashoj: 6,
  Karthik: 7,
  Mangsir: 8,
  Poush: 9,
  Magh: 10,
  Falgun: 11,
  Chaitra: 12,
}

const MONTH_BY_BS_NUMBER = Object.fromEntries(
  Object.entries(BS_MONTH_NUMBER).map(([name, number]) => [number, name])
) as Record<number, BsMonth>

function bsDateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Convert a BS year/month-name/day into the Gregorian date string (YYYY-MM-DD) stored in daily_entries.entry_date. */
export function bsToGregorian(bs: BsDate): string {
  return BSToAD(bsDateString(bs.bs_year, BS_MONTH_NUMBER[bs.bs_month], bs.bs_day))
}

/** Convert a Gregorian date string into its BS year/month/day. */
export function gregorianToBs(dateStr: string): BsDate {
  const [year, month, day] = ADToBS(dateStr).split('-').map(Number)
  return {
    bs_year: year,
    bs_month: MONTH_BY_BS_NUMBER[month],
    bs_day: day,
  }
}

/** Number of days in a given BS month/year — needed to size the bulk-entry grid columns. */
export function daysInBsMonth(bs_year: number, bs_month: BsMonth): number {
  const month = BS_MONTH_NUMBER[bs_month]
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? bs_year + 1 : bs_year
  try {
    const start = new Date(BSToAD(bsDateString(bs_year, month, 1)))
    const end = new Date(BSToAD(bsDateString(nextYear, nextMonth, 1)))
    return Math.round((end.getTime() - start.getTime()) / 86_400_000)
  } catch {
    return 32
  }
}

export function todayBs(): BsDate {
  return gregorianToBs(new Date().toISOString().slice(0, 10))
}
