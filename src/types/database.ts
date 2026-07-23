// Minimal hand-written types matching the Supabase schema in supabase/migrations.
// Regenerate with `supabase gen types typescript` once your project is live for full accuracy.

export type Role = 'admin' | 'supervisor' | 'operator' | 'viewer'

export type BsMonth =
  | 'Shrawan' | 'Bhadra' | 'Ashoj' | 'Karthik' | 'Mangsir' | 'Poush'
  | 'Magh' | 'Falgun' | 'Chaitra' | 'Baishak' | 'Jestha' | 'Ashar'

export type Project = {
  id: string
  name: string
  created_at: string
} & Record<string, unknown>

export type Pump = {
  id: string
  project_id: string
  pump_no: number
  label: string | null
  is_active: boolean
} & Record<string, unknown>

export type DailyEntry = {
  id: string
  pump_id: string
  entry_date: string // YYYY-MM-DD (Gregorian)
  bs_year: number
  bs_month: BsMonth
  bs_day: number
  operating_hours: number | null
  flowmeter_start_unit: number | null
  flowmeter_end_unit: number | null
  production: number | null
  backwash_time: number | null
  backwash_unit: number | null
  distribution: number | null
  lps: number | null
  entered_by: string | null
  created_at: string
  updated_at: string
} & Record<string, unknown>

export type Profile = {
  id: string
  full_name: string | null
  role: Role
  project_id: string | null
} & Record<string, unknown>

export const DAILY_VARIABLES = [
  'operating_hours',
  'flowmeter_start_unit',
  'flowmeter_end_unit',
  'production',
  'backwash_time',
  'backwash_unit',
  'distribution',
  'lps',
] as const

export type DailyVariable = (typeof DAILY_VARIABLES)[number]

// Supabase generic Database type (trimmed to what the client needs).
export interface Database {
  public: {
    Tables: {
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project>; Relationships: [] }
      pumps: { Row: Pump; Insert: Partial<Pump>; Update: Partial<Pump>; Relationships: [] }
      daily_entries: { Row: DailyEntry; Insert: Partial<DailyEntry>; Update: Partial<DailyEntry>; Relationships: [] }
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile>; Relationships: [] }
    }
    Views: {
      v_daily_entries_enriched: {
        Row: DailyEntry & Pick<Pump, 'pump_no' | 'project_id'> & { pump_label: string | null }
        Relationships: []
      }
    }
    Functions: {
      get_period_totals: {
        Args: {
          p_pump_id: string
          p_start: string
          p_end: string
        }
        Returns: { variable: string; value: number | null }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
