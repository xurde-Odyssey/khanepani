import { REPORT_PARAMETER_OPTIONS } from '../lib/reportParameters'

const rawFields = [
  ['operating_hours', 'Summed for the selected period.'],
  ['production', 'Summed for the selected period.'],
  ['distribution', 'Summed for the selected period.'],
  ['backwash_time', 'Summed for the selected period.'],
  ['backwash_unit', 'Summed for the selected period.'],
  ['lps', 'Averaged across available entries because it is a rate.'],
  ['flowmeter_start_unit / flowmeter_end_unit', 'Used to calculate flowmeter movement.'],
]

const formulas = [
  ['Flowmeter total', 'flowmeter_end_unit - flowmeter_start_unit'],
  ['Production / hr', 'production / operating_hours'],
  ['Production / 1k flow', 'production / (flowmeter_total / 1000)'],
  ['Distribution %', '(distribution * 100) / production'],
  ['Utilization %', '(operating_hours * 100) / available_hours'],
  ['Backwash %', '(backwash_time * 100) / operating_hours'],
  ['Flowmeter variance %', '((production - flowmeter_total) * 100) / production'],
]

const alerts = [
  ['No production during run hours', 'Operating hours is greater than 0 but production is 0.'],
  ['Low production per hour', 'Pump/date production per hour is below 80% of the comparison average.'],
  ['Production and flowmeter mismatch', 'Flowmeter variance is more than 5% in either direction.'],
  ['High backwash time', 'Backwash time is more than 10% of operating hours.'],
  ['High utilization', 'Utilization is more than 90% of available hours.'],
  ['Distribution below production', 'Distribution is below 80% of production.'],
]

export function Notes() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Notes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Calculation process used by dashboard, reports, and parameter comparisons.
        </p>
      </div>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900">Data Used</h2>
        <p className="mt-1 text-sm text-slate-500">
          Calculations are based on daily pump entries stored by pump and Gregorian entry date. Nepali dates are
          converted to Gregorian dates before lookup.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-3 py-2 text-left">Field</th>
                <th className="px-3 py-2 text-left">How it is handled</th>
              </tr>
            </thead>
            <tbody>
              {rawFields.map(([field, method]) => (
                <tr key={field} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{field}</td>
                  <td className="px-3 py-2 text-slate-600">{method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900">Comparison Parameters</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {REPORT_PARAMETER_OPTIONS.map((option) => (
            <div key={option.key} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {option.label}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900">Formula Reference</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-3 py-2 text-left">Metric</th>
                <th className="px-3 py-2 text-left">Calculation</th>
              </tr>
            </thead>
            <tbody>
              {formulas.map(([metric, formula]) => (
                <tr key={metric} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{metric}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900">Date Comparison</h2>
        <p className="mt-2 text-sm text-slate-600">
          For date comparison, selected pumps are grouped by each entry date. Production, operating hours,
          distribution, backwash, and flowmeter movement are summed for that date. LPS is averaged for that date.
        </p>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900">Alert Notes</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-3 py-2 text-left">Note</th>
                <th className="px-3 py-2 text-left">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(([note, meaning]) => (
                <tr key={note} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{note}</td>
                  <td className="px-3 py-2 text-slate-600">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
