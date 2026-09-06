'use client'

// Shared types, deterministic computation engine, file parsers and agent
// response helpers used by CreateScreen / ReportScreen / ImproveScreen.
// This file renders nothing itself; it exists to keep the three screens
// consistent without duplicating logic (closed output boundary: it still
// lives under app/sections/*.tsx).

// ---------------------------------------------------------------------------
// Types (mirror response_schemas/report_architect_coordinator.json)
// ---------------------------------------------------------------------------

export type ClaimClass = 'proven' | 'inferred' | 'unknown'

export interface Claim {
  id: string
  text: string
  class: ClaimClass
  basis: string
  alternative: string | null
}

export interface ChartSpec {
  type: string
  caption: string
  stats_pack_keys: string[]
}

export interface ReportSection {
  heading: string
  status: 'supported' | 'cannot_support' | 'partial'
  narrative: string
  body: string | null
  claims: Claim[]
  chart_spec: ChartSpec | null
}

export interface GapLedgerItem {
  field: string
  action_phrase: string
  tier: 'critical' | 'high' | 'optional'
  expected_impact: 'high' | 'medium' | 'low'
  conclusions_affected: number
  from_template: boolean
  // Present on DB-backed evidence_gaps rows and sample data; may be absent
  // on a freshly-returned coordinator gap_ledger item — render only if present.
  why_it_matters?: string | null
  unlocks_question?: string | null
  needs?: string | null
  explains_figure?: string | null
  id?: string
  resolved?: boolean
}

export interface QualityReview {
  claims_rejected: string[]
  what_could_mislead_a_skimmer: string
  what_we_missed: string
}

export interface ChangeSummary {
  claims_added: string[]
  claims_removed: string[]
  claims_reworded: string[]
  confidence_moved: string | null
  gaps_closed: string[]
  gaps_raised: string[]
}

export interface EvidenceStrengthMeta {
  basis_summary: string
  inferred_count: number
  proven_count: number
  unknown_count: number
}

export interface ReportJson {
  title: string
  period: string
  executive_summary: string
  overall_confidence: 'high' | 'moderate' | 'low'
  sections: ReportSection[]
  cannot_prove: string
  gap_ledger: GapLedgerItem[]
  quality_review: QualityReview
  charts: ChartSpec[]
  evidence_strength: EvidenceStrengthMeta
  change_summary: ChangeSummary | null
}

export interface StrengthComponents {
  data_completeness: number
  source_consistency: number
  evidence_coverage: number
  analytical_coverage: number
  freshness: number
}

export interface CompatibilityCheckClient {
  axis: 'grain' | 'units' | 'currency' | 'period' | 'definition'
  verdict: 'compatible' | 'reconcilable' | 'incompatible'
  pair: [string, string]
  reconciliation: string | null
}

export interface ColumnProfile {
  name: string
  type: 'metric' | 'dimension' | 'timestamp' | 'identifier'
  null_pct: number
  distinct: number
  sample_min?: number
  sample_max?: number
}

export interface DatasetProfile {
  name: string
  source_type: 'csv' | 'xlsx' | 'json' | 'pdf' | 'docx'
  role: 'source' | 'template'
  row_count?: number
  column_count?: number
  page_count?: number
  columns?: ColumnProfile[]
  grain?: string
  period_start?: string
  period_end?: string
  units?: string
  extracted_text?: string
  status: 'ok' | 'warning' | 'blocked'
  detail: string
}

export type DatasetInfo = DatasetProfile

export interface StatsPack {
  period: string
  baseline_period?: string
  metrics: Record<string, any>
  row_counts: Record<string, number>
  profiles: DatasetProfile[]
  compatibility: CompatibilityCheckClient[]
}

export interface ReportRow {
  id: string
  title: string
  question: string | null
  template_id: string | null
  dataset_ids: string[]
  stats_pack: StatsPack | any
  report_json: ReportJson | null
  evidence_strength: number
  strength_components: StrengthComponents | any
  version: number
  parent_report_id: string | null
  change_summary: ChangeSummary | any
  status: string
  created_at?: string
}

export type AuthFetch = (input: RequestInfo, init?: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------
// File parsers (run entirely in the browser)
// ---------------------------------------------------------------------------

function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim().replace(/^"|"$/g, ''))
}

export function parseCSVText(text: string): Record<string, any>[] {
  const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = splitCSVLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line)
    const row: Record<string, any> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

export async function parseXLSXBuffer(buf: ArrayBuffer): Promise<Record<string, any>[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[]
}

export function parseJSONText(text: string): Record<string, any>[] {
  try {
    const data = JSON.parse(text)
    if (Array.isArray(data)) return data
    if (data && typeof data === 'object') {
      const arrField = Object.values(data).find((v) => Array.isArray(v))
      if (Array.isArray(arrField)) return arrField as Record<string, any>[]
      return [data]
    }
  } catch {
    // fall through
  }
  return []
}

export async function parsePDFBuffer(buf: ArrayBuffer): Promise<{ pages: string[]; text: string }> {
  const pdfjsLib: any = await import('pdfjs-dist')
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  } catch {
    // worker URL resolution is best-effort; pdfjs falls back to fake worker
  }
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map((it: any) => it.str).join(' ')
    pages.push(pageText)
  }
  return { pages, text: pages.join('\n\n') }
}

export async function parseDOCXBuffer(buf: ArrayBuffer): Promise<string> {
  const mammoth: any = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result?.value ?? ''
}

// ---------------------------------------------------------------------------
// Deterministic computation engine
// ---------------------------------------------------------------------------

function isLikelyDate(v: any): boolean {
  if (typeof v !== 'string' && typeof v !== 'number') return false
  const s = String(v).trim()
  if (!s) return false
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return true
  const d = Date.parse(s)
  return !isNaN(d) && s.length >= 6
}

export function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
export function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
export function variance(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = mean(nums)
  return nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1)
}
export function stddev(nums: number[]): number {
  return Math.sqrt(variance(nums))
}
export function iqrOutliers(nums: number[]): number[] {
  if (nums.length < 4) return []
  const s = [...nums].sort((a, b) => a - b)
  const q1 = s[Math.floor(s.length * 0.25)]
  const q3 = s[Math.floor(s.length * 0.75)]
  const iqr = q3 - q1
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return nums.filter((n) => n < lo || n > hi)
}
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const A = a.slice(0, n)
  const B = b.slice(0, n)
  const ma = mean(A)
  const mb = mean(B)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (A[i] - ma) * (B[i] - mb)
    da += (A[i] - ma) ** 2
    db += (B[i] - mb) ** 2
  }
  const denom = Math.sqrt(da * db)
  return denom === 0 ? 0 : num / denom
}
export function growthRatePct(first: number, last: number): number {
  return first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 1000) / 10
}
export function linearProjection(series: number[], stepsAhead: number): number | null {
  const n = series.length
  if (n < 2) return null
  const xs = series.map((_, i) => i)
  const mx = mean(xs), my = mean(series)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (series[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx
  return Math.round(intercept + slope * (n - 1 + stepsAhead))
}
export function inferGrainFromDates(values: any[]): string {
  const parsed = values.map((d) => Date.parse(String(d))).filter((n) => !isNaN(n)).sort((a, b) => a - b)
  const unique = Array.from(new Set(parsed))
  if (unique.length < 2) return 'unknown'
  const diffs: number[] = []
  for (let i = 1; i < unique.length; i++) diffs.push(unique[i] - unique[i - 1])
  const medGapDays = median(diffs) / 86400000
  if (medGapDays <= 1.5) return 'daily'
  if (medGapDays <= 9) return 'weekly'
  if (medGapDays <= 40) return 'monthly'
  if (medGapDays <= 100) return 'quarterly'
  return 'yearly'
}

export function inferColumns(rows: Record<string, any>[]): ColumnProfile[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const headers = Object.keys(rows[0] ?? {})
  return headers.map((h) => {
    const values = rows.map((r) => r?.[h]).filter((v) => v !== undefined && v !== null && v !== '')
    const nullCount = rows.length - values.length
    const distinctSet = new Set(values.map((v) => String(v)))
    const numericVals = values.filter((v) => v !== '' && !isNaN(parseFloat(String(v))) && isFinite(Number(v)))
    const dateVals = values.filter(isLikelyDate)
    let type: ColumnProfile['type'] = 'dimension'
    if (values.length > 0 && dateVals.length / values.length > 0.7) type = 'timestamp'
    else if (values.length > 0 && numericVals.length / values.length > 0.7) {
      type = distinctSet.size === rows.length && rows.length > 5 ? 'identifier' : 'metric'
    } else if (distinctSet.size === rows.length && rows.length > 5) type = 'identifier'
    const nums = numericVals.map(Number)
    return {
      name: h,
      type,
      null_pct: rows.length ? Math.round((nullCount / rows.length) * 1000) / 10 : 0,
      distinct: distinctSet.size,
      sample_min: nums.length ? Math.min(...nums) : undefined,
      sample_max: nums.length ? Math.max(...nums) : undefined,
    }
  })
}

export function profileTabularDataset(name: string, sourceType: 'csv' | 'xlsx' | 'json', rows: Record<string, any>[], role: 'source' | 'template'): DatasetProfile {
  const columns = inferColumns(rows)
  const tsCol = columns.find((c) => c.type === 'timestamp')
  let periodStart: string | undefined, periodEnd: string | undefined, grain: string | undefined
  if (tsCol) {
    const values = rows.map((r) => r?.[tsCol.name]).filter(Boolean)
    grain = inferGrainFromDates(values)
    const parsed = values.map((v) => Date.parse(String(v))).filter((n) => !isNaN(n)).sort((a, b) => a - b)
    if (parsed.length) {
      periodStart = new Date(parsed[0]).toISOString().slice(0, 10)
      periodEnd = new Date(parsed[parsed.length - 1]).toISOString().slice(0, 10)
    }
  }
  return {
    name,
    source_type: sourceType,
    role,
    row_count: rows.length,
    column_count: columns.length,
    columns,
    grain,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'ok',
    detail: `${rows.length.toLocaleString()} rows${grain ? `, ${grain}` : ''}${periodStart ? `, ${periodStart} to ${periodEnd}` : ''}`,
  }
}

export function profileDocument(name: string, sourceType: 'pdf' | 'docx', text: string, pageCount: number | undefined, role: 'source' | 'template'): DatasetProfile {
  return {
    name,
    source_type: sourceType,
    role,
    page_count: pageCount,
    extracted_text: text,
    status: role === 'template' ? 'ok' : 'blocked',
    detail: role === 'template'
      ? `${pageCount ?? '?'} pages \u00b7 structure detected`
      : `${pageCount ?? '?'} pages \u00b7 figures kept separate`,
  }
}

const GRAIN_ORDER = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export function checkCompatibility(a: DatasetProfile, b: DatasetProfile): CompatibilityCheckClient[] {
  const checks: CompatibilityCheckClient[] = []
  if (a.grain && b.grain && a.grain !== b.grain && GRAIN_ORDER.includes(a.grain) && GRAIN_ORDER.includes(b.grain)) {
    const ia = GRAIN_ORDER.indexOf(a.grain)
    const ib = GRAIN_ORDER.indexOf(b.grain)
    const finer = ia < ib ? a : b
    const coarser = ia < ib ? b : a
    checks.push({
      axis: 'grain',
      verdict: 'reconcilable',
      pair: [a.name, b.name],
      reconciliation: `${finer.name} is ${finer.grain}, ${coarser.name} is ${coarser.grain}. I'll roll ${finer.name} up to ${coarser.grain} so they can be compared \u2014 nothing is estimated or split.`,
    })
  }
  // Shared-metric currency/unit heuristic: same-named metric column present in both,
  // detected via column name overlap on likely revenue/amount-style fields.
  const sharedMetricNames = (a.columns ?? [])
    .filter((c) => c.type === 'metric')
    .map((c) => c.name.toLowerCase())
    .filter((n) => (b.columns ?? []).some((bc) => bc.type === 'metric' && bc.name.toLowerCase() === n))
  if (sharedMetricNames.length === 0 && (a.columns?.some((c) => c.type === 'metric') && b.columns?.some((c) => c.type === 'metric'))) {
    // No common metric definition at all between two data files sharing a period is only a soft note, not a hard block.
  }
  return checks
}

export function computeFreshnessScore(periodEndStr?: string): number {
  if (!periodEndStr) return 7
  const end = Date.parse(periodEndStr)
  if (isNaN(end)) return 7
  const days = (Date.now() - end) / 86400000
  if (days <= 30) return 10
  if (days <= 90) return 8
  if (days <= 180) return 5
  return 2
}

export function computeEvidenceStrength(
  profiles: DatasetProfile[],
  gapLedger: GapLedgerItem[],
  compat: CompatibilityCheckClient[]
): { total: number; components: StrengthComponents } {
  const sourceProfiles = profiles.filter((p) => p.role === 'source')
  const tabular = sourceProfiles.filter((p) => p.columns && p.columns.length)
  const nullRates = tabular.flatMap((p) => (p.columns || []).filter((c) => c.type === 'metric').map((c) => c.null_pct))
  const avgNull = nullRates.length ? mean(nullRates) : 12
  const totalRows = tabular.reduce((s, p) => s + (p.row_count || 0), 0)
  const completeness = Math.round(Math.max(0, Math.min(25, 25 * (1 - avgNull / 100) * (totalRows >= 30 ? 1 : 0.6))))

  const incompatible = compat.filter((c) => c.verdict === 'incompatible').length
  const reconcilable = compat.filter((c) => c.verdict === 'reconcilable').length
  const consistency = Math.round(Math.max(0, 20 - incompatible * 10 - reconcilable * 2))

  const critical = gapLedger.filter((g) => g.tier === 'critical').length
  const high = gapLedger.filter((g) => g.tier === 'high').length
  const coverage = Math.round(Math.max(0, 25 - critical * 8 - high * 4))

  const analysesPossible = [
    tabular.some((p) => (p.columns || []).some((c) => c.type === 'timestamp')),
    tabular.some((p) => (p.columns || []).some((c) => c.type === 'dimension' && c.distinct > 1 && c.distinct < 50)),
    tabular.some((p) => (p.columns || []).filter((c) => c.type === 'metric').length >= 2),
    tabular.some((p) => (p.columns || []).some((c) => c.type === 'metric') && (p.row_count || 0) >= 30),
  ].filter(Boolean).length
  const analytical = Math.round((analysesPossible / 4) * 20)

  const latestEnd = tabular.map((p) => p.period_end).filter(Boolean).sort().pop()
  const freshness = computeFreshnessScore(latestEnd)

  const components: StrengthComponents = {
    data_completeness: completeness,
    source_consistency: consistency,
    evidence_coverage: coverage,
    analytical_coverage: analytical,
    freshness,
  }
  const total = Math.max(0, Math.min(100, completeness + consistency + coverage + analytical + freshness))
  return { total, components }
}

// ---------------------------------------------------------------------------
// Agent response helpers (defensive JSON parsing — never trust shape blindly)
// ---------------------------------------------------------------------------

export function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

export function coerceJson<T = any>(value: any): T | null {
  if (value == null) return null
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      return JSON.parse(stripJsonFences(value)) as T
    } catch {
      return null
    }
  }
  return null
}

export function validateReportJson(obj: any): obj is ReportJson {
  return !!obj
    && typeof obj === 'object'
    && typeof obj.title === 'string'
    && typeof obj.period === 'string'
    && typeof obj.executive_summary === 'string'
    && Array.isArray(obj.sections)
    && Array.isArray(obj.gap_ledger)
    && obj.quality_review
    && typeof obj.cannot_prove === 'string'
}

export function normalizeReportJson(raw: any): ReportJson | null {
  const obj = coerceJson<any>(raw)
  if (!obj) return null
  // Coerce fields the model occasionally stringifies.
  if (typeof obj.sections === 'string') obj.sections = coerceJson(obj.sections) ?? []
  if (typeof obj.gap_ledger === 'string') obj.gap_ledger = coerceJson(obj.gap_ledger) ?? []
  if (typeof obj.charts === 'string') obj.charts = coerceJson(obj.charts) ?? []
  if (typeof obj.quality_review === 'string') obj.quality_review = coerceJson(obj.quality_review) ?? { claims_rejected: [], what_could_mislead_a_skimmer: '', what_we_missed: '' }
  if (typeof obj.evidence_strength === 'string') obj.evidence_strength = coerceJson(obj.evidence_strength) ?? { basis_summary: '', proven_count: 0, inferred_count: 0, unknown_count: 0 }
  if (!Array.isArray(obj.sections)) obj.sections = []
  if (!Array.isArray(obj.gap_ledger)) obj.gap_ledger = []
  if (!Array.isArray(obj.charts)) obj.charts = []
  obj.sections = obj.sections.map((s: any) => ({
    heading: s?.heading ?? 'Untitled section',
    status: s?.status ?? 'partial',
    narrative: s?.narrative ?? '',
    body: s?.body ?? null,
    claims: Array.isArray(s?.claims) ? s.claims : [],
    chart_spec: s?.chart_spec ?? null,
  }))
  if (!validateReportJson(obj)) return null
  return obj as ReportJson
}

function unusedDefaultExport() { return null }
export default unusedDefaultExport
