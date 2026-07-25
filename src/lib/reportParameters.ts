export type ReportParameterKey =
  | 'production'
  | 'operatingHours'
  | 'avgLps'
  | 'flowmeterTotal'
  | 'productionPerHour'
  | 'productionPerKld'
  | 'distributionPercent'
  | 'utilizationPercent'
  | 'backwashPercent'
  | 'flowmeterVariancePercent'
  | 'notes'

export const REPORT_PARAMETER_OPTIONS: { key: ReportParameterKey; label: string; suffix?: string }[] = [
  { key: 'production', label: 'Production' },
  { key: 'operatingHours', label: 'Run hours' },
  { key: 'avgLps', label: 'Avg LPS' },
  { key: 'flowmeterTotal', label: 'Flowmeter total' },
  { key: 'productionPerHour', label: 'Production / hr' },
  { key: 'productionPerKld', label: 'Production / 1k flow' },
  { key: 'distributionPercent', label: 'Distribution %', suffix: '%' },
  { key: 'utilizationPercent', label: 'Utilization %', suffix: '%' },
  { key: 'backwashPercent', label: 'Backwash %', suffix: '%' },
  { key: 'flowmeterVariancePercent', label: 'Flowmeter variance %', suffix: '%' },
  { key: 'notes', label: 'Notes' },
]

export const DEFAULT_REPORT_PARAMETER_KEYS = REPORT_PARAMETER_OPTIONS.map((option) => option.key)

export function parseReportParameterKeys(fields: string | null): ReportParameterKey[] {
  if (!fields) return DEFAULT_REPORT_PARAMETER_KEYS
  const requested = fields.split(',').filter((field): field is ReportParameterKey =>
    REPORT_PARAMETER_OPTIONS.some((option) => option.key === field)
  )
  return requested.length > 0 ? requested : DEFAULT_REPORT_PARAMETER_KEYS
}
