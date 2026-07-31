import { BS_MONTHS, bsToGregorian, daysInBsMonth, gregorianToBs, todayBs } from '../lib/bsCalendar'
import type { BsMonth } from '../types/database'

function dateToBs(value: string) {
  try {
    return value ? gregorianToBs(value) : todayBs()
  } catch {
    return todayBs()
  }
}

function clampBsDay(year: number, month: BsMonth, day: number) {
  const maxDay = daysInBsMonth(year, month)
  if (!Number.isFinite(day)) return 1
  return Math.min(maxDay, Math.max(1, Math.trunc(day)))
}

export function BsDateInput({
  label,
  value,
  onChange,
  allowClear = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  allowClear?: boolean
}) {
  const bs = dateToBs(value)

  function update(next: Partial<{ bs_year: number; bs_month: BsMonth; bs_day: number }>) {
    const nextYear = next.bs_year ?? bs.bs_year
    const nextMonth = next.bs_month ?? bs.bs_month
    const nextDay = clampBsDay(nextYear, nextMonth, next.bs_day ?? bs.bs_day)
    onChange(bsToGregorian({ bs_year: nextYear, bs_month: nextMonth, bs_day: nextDay }))
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium">{label}</label>
        {allowClear && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-[1fr_1.35fr_0.85fr] gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={bs.bs_year}
          onChange={(e) => update({ bs_year: Number(e.target.value) })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <select
          value={bs.bs_month}
          onChange={(e) => update({ bs_month: e.target.value as BsMonth })}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          {BS_MONTHS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={daysInBsMonth(bs.bs_year, bs.bs_month)}
          value={bs.bs_day}
          onChange={(e) => update({ bs_day: Number(e.target.value) })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>
    </div>
  )
}
