'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Toaster, toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  FileBarChart, Plus, Settings as SettingsIcon, Sun, Moon, LogOut, Loader2,
  CheckCircle2, Circle, Mail, MessageSquare, Bot, X, Sparkles, Search,
  ArrowRight, ShieldCheck, TrendingUp, AlertTriangle, Database, Layers,
  ChevronRight, HelpCircle, Activity, ArrowUpRight, Check,
} from 'lucide-react'
import CreateScreen from '@/app/sections/CreateScreen'
import ReportScreen from '@/app/sections/ReportScreen'
import ImproveScreen from '@/app/sections/ImproveScreen'
import type { ReportRow, DatasetInfo, ReportJson } from '@/app/sections/CreateScreen'

// ---------- shared agent roster ----------
export const AGENT_IDS = {
  coordinator: '6a9d0d47d9820ae7e1de3cb8',
  sourceUnderstanding: '6a9d0cd410cf3452296d17a1',
  evidenceAuditor: '6a9d0cee1859ffd6525e1793',
  insightAnalyst: '6a9d0d000c845399eac15884',
  qa: '6a9d0d0fb73b0cebf57166b3',
  email: '6a9d0d230c845399eac15886',
  slack: '6a9d0d23598b068e18814dc9',
}

export const AGENT_ROSTER = [
  { id: AGENT_IDS.coordinator, name: 'Report Architect Coordinator', model: 'Claude Opus 4.6', role: 'Orchestrator', purpose: 'Decides report structure, enforces chart rules, conducts final audit.' },
  { id: AGENT_IDS.sourceUnderstanding, name: 'Source Understanding Agent', model: 'Claude Sonnet 4.6', role: 'Data Profile & Provenance', purpose: 'Profiles data columns, checks grain/unit compatibility, tracks facts.' },
  { id: AGENT_IDS.evidenceAuditor, name: 'Evidence Auditor Agent', model: 'Claude Sonnet 4.6', role: 'Gap & Conflict Auditor', purpose: 'Identifies missing evidence, recommends conflict reconciliations.' },
  { id: AGENT_IDS.insightAnalyst, name: 'Insight Analyst Agent', model: 'Claude Sonnet 4.6', role: 'Synthesis & Claims', purpose: 'Extracts findings and labels each proven, inferred, or unknown.' },
  { id: AGENT_IDS.qa, name: 'Report Q&A Analyst', model: 'Claude Sonnet 4.5', role: 'Interactive Specialist', purpose: 'Answers queries strictly grounded in the Stats Pack.' },
  { id: AGENT_IDS.email, name: 'Email Delivery Agent', model: 'Claude Sonnet 4.5', role: 'Composio Gmail', purpose: 'Drafts and delivers executive email briefing with PDF attached.' },
  { id: AGENT_IDS.slack, name: 'Slack Delivery Agent', model: 'Claude Sonnet 4.5', role: 'Composio Slack', purpose: 'Drafts and posts concise executive synopsis with report link.' },
]

type Screen = 'reports' | 'create' | 'report' | 'improve' | 'settings'

// ---------- sample data (shown when Sample Data toggle is ON) ----------
export const SAMPLE_REPORT: ReportRow = {
  id: 'sample-report-1',
  title: 'Q2 Enterprise Bookings Review',
  question: 'Why did enterprise sales decline in Q2?',
  template_id: 'sample-template',
  dataset_ids: ['sales.xlsx', 'customers.csv', 'board-report.pdf', 'q1-board-format.docx'],
  stats_pack: {
    period: 'April\u2013June 2025',
    baseline_period: 'January\u2013March 2025',
    metrics: {
      bookings_net_total: 4820000,
      bookings_prior_total: 5480000,
      bookings_decline_pct: 12,
      average_order_value: 1240,
      apac_enterprise_accounts: 11,
      weekly_bookings: [480000, 476000, 470000, 465000, 460000, 452000, 430000, 415000, 405000, 398000, 392000, 388000, 386000],
    },
  },
  report_json: {
    title: 'Q2 Enterprise Bookings Review',
    period: 'April\u2013June 2025 \u00b7 3 data sources \u00b7 Quarterly board format',
    executive_summary: 'Bookings fell 12% over the quarter, dropping from $5.48M to $4.82M. The decline is heavily concentrated in enterprise renewals across APAC.',
    overall_confidence: 'moderate',
    cannot_prove: 'Where it happened is settled. Why it happened is not \u2014 these files hold no cost, churn or pricing history, so this report stops at location, refusing to guess causality.',
    sections: [
      {
        heading: 'What happened',
        status: 'supported',
        narrative: 'Bookings fell from $5.48M to $4.82M. The drop was not gradual \u2014 it began sharply in week 7 and plateaued at the lower run-rate for the remaining 6 weeks of the quarter.',
        body: null,
        claims: [],
        chart_spec: { type: 'line', caption: 'Bookings fell from week 7 onward and plateaued without recovery.', stats_pack_keys: ['metrics.weekly_bookings'] },
      },
      {
        heading: "Why we can't tell yet",
        status: 'cannot_support',
        narrative: 'Your board template reports gross margin here. None of the uploaded files contain unit cost or discount data, so rather than substitute a proxy, this section stays intentionally open.',
        body: 'Upload product cost or discount schedules to unlock margin attribution.',
        claims: [],
        chart_spec: null,
      },
      {
        heading: 'What you should know',
        status: 'supported',
        narrative: '',
        body: null,
        claims: [
          { id: 'c1', text: 'Bookings fell 12%, declining from $5.48M to $4.82M.', class: 'proven', basis: 'sales.xlsx, 38,940 rows computed', alternative: null },
          { id: 'c2', text: 'Average order value held constant at $1,240, confirming this is a volume decline.', class: 'proven', basis: 'sales.xlsx, monthly aggregate', alternative: null },
          { id: 'c3', text: 'The fall is concentrated in 11 APAC enterprise accounts.', class: 'inferred', basis: 'segment split by region and tier', alternative: 'Eleven accounts is a small sample \u2014 two slipped renewals would yield the exact same pattern.' },
          { id: 'c4', text: 'Did customers defect, or did active clients reduce expansion spend?', class: 'unknown', basis: 'no customer-level churn log present', alternative: 'Customer-level account churn data will definitively settle this.' },
        ],
        chart_spec: null,
      },
      { heading: "What you're missing", status: 'supported', narrative: '', body: null, claims: [], chart_spec: null },
      { heading: 'What to do next', status: 'supported', narrative: '', body: null, claims: [], chart_spec: null },
    ],
    gap_ledger: [
      { field: 'customer_level_data', action_phrase: 'Add customer-level data \u2192 could explain the 18% enterprise decline and change 2 conclusions', tier: 'critical', expected_impact: 'high', conclusions_affected: 2, from_template: false, why_it_matters: 'We see the revenue decline clearly, but cannot tell whether accounts terminated or down-scoped renewals.' },
      { field: 'pricing_history', action_phrase: 'Add pricing history \u2192 would separate price from volume and add 1 conclusion', tier: 'high', expected_impact: 'medium', conclusions_affected: 1, from_template: false, why_it_matters: 'Discounts may have masked underlying unit shifts.' },
      { field: 'cost_data', action_phrase: 'Add cost data \u2192 fills the Margin review section your template expects', tier: 'optional', expected_impact: 'low', conclusions_affected: 0, from_template: true, why_it_matters: 'Template expects Gross Margin analysis.' },
    ],
    quality_review: {
      claims_rejected: [],
      what_could_mislead_a_skimmer: 'Average order value held steady, which could look like stability on the surface \u2014 the decline is entirely in order volume, concentrated geographically.',
      what_we_missed: 'Customer-level retention and account contract logs.',
    },
    charts: [{ type: 'line', caption: 'Bookings fell from week 7 onward and did not recover.', stats_pack_keys: ['metrics.weekly_bookings'] }],
    evidence_strength: { proven_count: 2, inferred_count: 1, unknown_count: 1, basis_summary: 'Two verified proven findings, one inferred reading with stated alternative, one open unknown.' },
    change_summary: null,
  } as ReportJson,
  evidence_strength: 71,
  strength_components: { data_completeness: 20, source_consistency: 14, evidence_coverage: 12, analytical_coverage: 16, freshness: 9 },
  version: 1,
  parent_report_id: null,
  change_summary: null,
  status: 'current',
  created_at: new Date(2025, 5, 28).toISOString(),
}

export const SAMPLE_DATASETS: DatasetInfo[] = [
  { name: 'sales.xlsx', source_type: 'xlsx', role: 'source', row_count: 38940, grain: 'monthly', period_start: 'April', period_end: 'June', status: 'ok', detail: '38,940 rows, monthly, April to June' },
  { name: 'customers.csv', source_type: 'csv', role: 'source', row_count: 6204, grain: 'daily', status: 'ok', detail: '6,204 rows, daily' },
  { name: 'board-report.pdf', source_type: 'pdf', role: 'source', page_count: 18, status: 'blocked', detail: '18 pages \u00b7 figures kept separate' },
  { name: 'q1-board-format.docx', source_type: 'docx', role: 'template', status: 'ok', detail: '5 sections detected' },
]

export const SAMPLE_REPORTS_LIST: ReportRow[] = [
  SAMPLE_REPORT,
  {
    ...SAMPLE_REPORT,
    id: 'sample-report-2',
    title: 'Q1 Global Bookings Baseline',
    question: 'What was the Q1 baseline performance by region?',
    version: 1,
    evidence_strength: 64,
    created_at: new Date(2025, 2, 30).toISOString(),
    report_json: { ...SAMPLE_REPORT.report_json!, title: 'Q1 Global Bookings Baseline', period: 'January\u2013March 2025 \u00b7 2 data sources' },
  },
]

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2 leading-relaxed">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="mt-3 text-sm font-semibold tracking-tight text-foreground">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="mt-3 text-base font-semibold tracking-tight text-foreground">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="mt-4 text-lg font-bold tracking-tight text-foreground">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm text-muted-foreground">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm text-muted-foreground">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm text-foreground/90">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part))
}
export { renderMarkdown }

function useThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('evidence-theme') : null
    const isDark = saved ? saved === 'dark' : document.documentElement.classList.contains('dark')
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])
  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      window.localStorage.setItem('evidence-theme', next ? 'dark' : 'light')
      return next
    })
  }, [])
  return { dark, toggle }
}



function RailLink({
  icon, label, badge, active, dominant, onClick,
}: {
  icon: React.ReactNode
  label: string
  badge?: string | number
  active?: boolean
  dominant?: boolean
  onClick: () => void
}) {
  if (dominant) {
    return (
      <button
        onClick={onClick}
        className="mx-3 mt-3 flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground shadow-md shadow-accent/20 transition-all hover:opacity-95 hover:shadow-lg active:scale-[0.98]"
      >
        {icon}
        <span className="hidden sm:inline font-medium">{label}</span>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`mx-2.5 flex min-h-[40px] items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all ${
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm ring-1 ring-sidebar-border'
          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="hidden sm:inline truncate">{label}</span>
      </div>
      {badge !== undefined && (
        <span className="hidden sm:inline-flex rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-mono font-medium text-primary">
          {badge}
        </span>
      )}
    </button>
  )
}

function AppShell() {
  const user = useMemo(() => ({ id: 'usr-analyst-lead', email: 'analyst@evidence.internal', name: 'Lead Evidence Analyst' }), [])
  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    return fetch(url, init)
  }, [])
  const { dark, toggle } = useThemeToggle()
  const [screen, setScreen] = useState<Screen>('reports')
  const [sampleData, setSampleData] = useState(true)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [activeReport, setActiveReport] = useState<ReportRow | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const seeded = useRef(false)

  const loadReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await authFetch('/api/reports')
      if (res.ok) {
        const data = await res.json()
        if (data?.success && Array.isArray(data.data) && data.data.length > 0) {
          setReports(data.data)
        }
      }
    } catch {
      // Graceful fallback to sample dossiers
    } finally {
      setLoadingReports(false)
    }
  }, [authFetch])

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    ;(async () => {
      try {
        await authFetch('/api/seed', { method: 'POST' })
      } catch {}
      loadReports()
    })()
  }, [authFetch, loadReports])

  const openReport = (r: ReportRow) => {
    setActiveReport(r)
    setScreen('report')
  }

  const handleReportSaved = (r: ReportRow) => {
    setActiveReport(r)
    setScreen('report')
    setReports((prev) => {
      const others = prev.filter((p) => p.id !== r.id)
      return [r, ...others]
    })
    if (!r.id.startsWith('sample-')) loadReports()
  }

  const displayReports = sampleData ? [...SAMPLE_REPORTS_LIST, ...reports] : reports

  return (
    <div className="grid h-screen overflow-hidden grid-cols-[68px_1fr] bg-background text-foreground sm:grid-cols-[240px_1fr]">
      
      {/* Modern High-Aesthetic Sidebar Rail */}
      <nav className="flex h-full flex-col gap-1.5 border-r border-sidebar-border bg-sidebar py-5 text-sidebar-foreground overflow-y-auto">
        <div className="hidden px-5 pb-4 sm:block">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="font-editorial text-lg font-semibold tracking-tight text-sidebar-foreground">Evidence</span>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono tracking-wider text-sidebar-foreground/60 uppercase">AI ANALYST</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-center pb-3 sm:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <RailLink
          icon={<Plus className="h-4 w-4 shrink-0" />}
          label="New dossier"
          dominant
          onClick={() => setScreen('create')}
        />

        <div className="my-2 px-3">
          <div className="h-px bg-sidebar-border/60" />
        </div>

        <RailLink
          icon={<FileBarChart className="h-4 w-4 shrink-0" />}
          label="Reports"
          badge={displayReports.length}
          active={screen === 'reports'}
          onClick={() => setScreen('reports')}
        />
        <RailLink
          icon={<SettingsIcon className="h-4 w-4 shrink-0" />}
          label="Agent Mesh"
          active={screen === 'settings'}
          onClick={() => setScreen('settings')}
        />

        {/* Live Network Status Pill */}
        <div className="hidden sm:block mx-3 mt-4 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-sidebar-foreground/70">Agent Fleet</span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 7 online
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-sidebar-foreground/50 truncate">
            {activeAgentId ? 'Specialist active' : 'Deterministic engine idle'}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2 px-3 pt-4">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex min-h-[38px] items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/20 px-3 py-2 text-xs text-sidebar-foreground/80 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            {dark ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline font-medium">{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          
          <div className="flex min-h-[38px] items-center justify-between gap-2 rounded-xl border border-sidebar-border/50 bg-sidebar-accent/15 px-3 py-2 text-xs text-sidebar-foreground/75">
            <span className="truncate font-mono text-[11px]">{user.email}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Analyst Active" />
          </div>
        </div>
      </nav>

      {/* Main Workspace Area */}
      <main className="h-full min-w-0 overflow-y-auto subtle-mesh">
        {/* Top Operational Bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Workspace</span>
            <span>/</span>
            <span className="capitalize font-mono">{screen}</span>
            {activeReport && screen === 'report' && (
              <>
                <span>/</span>
                <span className="max-w-[200px] truncate text-foreground font-medium">{activeReport.title}</span>
                <Badge variant="outline" className="text-[10px] font-mono">v{activeReport.version}</Badge>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
              <Database className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground hidden sm:inline">Sample Dataset:</span>
              <span className="font-mono text-[11px] font-semibold text-foreground">{sampleData ? 'ON' : 'OFF'}</span>
              <Switch checked={sampleData} onCheckedChange={setSampleData} aria-label="Sample Data toggle" />
            </div>
          </div>
        </header>

        {screen === 'reports' && (
          <ReportsListScreen
            reports={displayReports}
            loading={loadingReports}
            onOpen={openReport}
            onNew={() => setScreen('create')}
            sampleData={sampleData}
          />
        )}
        {screen === 'create' && (
          <CreateScreen
            authFetch={authFetch}
            userId={user?.id ?? ''}
            activeAgentId={activeAgentId}
            setActiveAgentId={setActiveAgentId}
            onReportReady={handleReportSaved}
            sampleData={sampleData}
          />
        )}
        {screen === 'report' && activeReport && (
          <ReportScreen
            report={activeReport}
            authFetch={authFetch}
            userId={user?.id ?? ''}
            activeAgentId={activeAgentId}
            setActiveAgentId={setActiveAgentId}
            onReportUpdated={(r) => setActiveReport(r)}
            onBack={() => setScreen('reports')}
            onImprove={() => setScreen('improve')}
            sampleData={sampleData}
          />
        )}
        {screen === 'improve' && activeReport && (
          <ImproveScreen
            report={activeReport}
            authFetch={authFetch}
            activeAgentId={activeAgentId}
            setActiveAgentId={setActiveAgentId}
            onReportUpdated={(r) => setActiveReport(r)}
            onBack={() => setScreen('report')}
            sampleData={sampleData}
          />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            userEmail={user?.email ?? ''}
            userName={user?.name ?? ''}
            activeAgentId={activeAgentId}
          />
        )}
        {(screen === 'report' || screen === 'improve') && !activeReport && (
          <div className="flex min-h-[60vh] items-center justify-center p-8 text-center">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-sm max-w-sm">
              <FileBarChart className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-foreground">No dossier selected</h3>
              <p className="mt-1 text-xs text-muted-foreground">Select an existing report or generate a new one from your data.</p>
              <Button className="mt-5 w-full" onClick={() => setScreen('reports')}>Back to reports</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function ReportsListScreen({
  reports, loading, onOpen, onNew, sampleData,
}: {
  reports: ReportRow[]
  loading: boolean
  onOpen: (r: ReportRow) => void
  onNew: () => void
  sampleData: boolean
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return reports
    const q = search.toLowerCase()
    return reports.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      (r.question && r.question.toLowerCase().includes(q)) ||
      (r.report_json?.period && r.report_json.period.toLowerCase().includes(q))
    )
  }, [reports, search])

  const stats = useMemo(() => {
    if (reports.length === 0) return { avgStrength: 0, highCount: 0, criticalGaps: 0 }
    const avg = Math.round(reports.reduce((acc, r) => acc + (r.evidence_strength || 0), 0) / reports.length)
    const high = reports.filter((r) => (r.evidence_strength || 0) >= 70).length
    const gaps = reports.reduce((acc, r) => {
      const g = r.report_json?.gap_ledger?.filter((item) => item?.tier === 'critical').length || 0
      return acc + g
    }, 0)
    return { avgStrength: avg, highCount: high, criticalGaps: gaps }
  }, [reports])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="space-y-3 pt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-lg shadow-primary/10">
          <FileBarChart className="h-8 w-8" />
        </div>
        <span className="mt-4 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[11px] font-mono text-primary uppercase">
          Zero Assumptions
        </span>
        <h2 className="mt-3 font-editorial text-3xl font-medium tracking-tight text-foreground text-balance">
          Drop a file, get an honest answer
        </h2>
        <p className="mt-2 text-sm text-muted-foreground text-pretty max-w-md">
          Evidence computes all statistical figures deterministically first, then audits what the data proves, what it suggests, and what remains unknown.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Button size="lg" className="min-h-[44px] shadow-sm" onClick={onNew}>
            <Plus className="mr-2 h-4 w-4" /> Create first report
          </Button>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground max-w-sm">
          Tip: Toggle <b className="text-foreground">Sample Data</b> in the top right to instantly explore an APAC enterprise bookings report.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Audited Intelligence Ledger</span>
          </div>
          <h1 className="mt-1 font-editorial text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Executive Reports
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Mathematically bound findings. Inferred claims are stated with alternative hypotheses.
          </p>
        </div>
        <Button onClick={onNew} className="shrink-0 min-h-[42px] shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> New report
        </Button>
      </div>

      {/* KPI Summary Ribbon */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase text-muted-foreground">Dossiers</div>
          <div className="mt-1 text-2xl font-bold font-mono-num text-foreground">{reports.length}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Active versions tracked</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase text-muted-foreground">Avg. Evidence Strength</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono-num text-primary">{stats.avgStrength}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Computed score index</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase text-muted-foreground">High Confidence</div>
          <div className="mt-1 text-2xl font-bold font-mono-num text-emerald-600 dark:text-emerald-400">{stats.highCount}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Score &ge; 70 threshold</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase text-muted-foreground">Critical Gaps</div>
          <div className="mt-1 text-2xl font-bold font-mono-num text-destructive">{stats.criticalGaps}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Actionable missing data</div>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div className="mt-7 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports or questions..."
            className="pl-9 text-xs min-h-[38px] bg-card"
          />
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Showing {filtered.length} of {reports.length}
        </div>
      </div>

      {/* Reports Card Deck */}
      <div className="mt-4 space-y-3">
        {filtered.map((r) => {
          const gaps = r.report_json?.gap_ledger || []
          const criticalCount = gaps.filter((g) => g.tier === 'critical').length
          const totalGaps = gaps.length
          const score = r.evidence_strength || 0
          const scoreColor = score >= 70 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : score >= 50 ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-destructive bg-destructive/10 border-destructive/20'

          return (
            <div
              key={r.id}
              onClick={() => onOpen(r)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r) }}
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md hover:bg-card/90 cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="text-[10px] font-mono tracking-wider">
                    v{r.version}.0
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {r.report_json?.period || 'Period not detected'}
                  </span>
                  {r.id.startsWith('sample-') && (
                    <Badge variant="secondary" className="text-[10px] font-mono text-primary">
                      Sample Data
                    </Badge>
                  )}
                </div>

                <h3 className="font-editorial text-xl font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  {r.title}
                </h3>

                {r.question && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1 italic">
                    &ldquo;{r.question}&rdquo;
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{r.dataset_ids?.length || 0} source files</span>
                  <span>&middot;</span>
                  <span>{r.report_json?.sections?.length || 0} narrative sections</span>
                  {criticalCount > 0 ? (
                    <>
                      <span>&middot;</span>
                      <span className="flex items-center gap-1 font-medium text-destructive">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                        {criticalCount} critical gap{criticalCount > 1 ? 's' : ''}
                      </span>
                    </>
                  ) : totalGaps > 0 ? (
                    <>
                      <span>&middot;</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {totalGaps} gap{totalGaps > 1 ? 's' : ''} to improve
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Evidence Strength Dial / Gauge */}
              <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 border-t sm:border-t-0 border-border/60 pt-3 sm:pt-0">
                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Evidence Strength
                  </div>
                  <div className="mt-0.5 flex items-center justify-end gap-2">
                    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-sm font-bold ${scoreColor}`}>
                      {score}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">/ 100</span>
                  </div>
                  <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-muted/20 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all shadow-sm">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsScreen({ userEmail, userName, activeAgentId }: { userEmail: string; userName: string; activeAgentId: string | null }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-7">
      <div className="border-b border-border pb-5">
        <span className="text-xs font-mono uppercase tracking-wider text-primary">System Infrastructure</span>
        <h1 className="mt-1 font-editorial text-3xl font-semibold tracking-tight text-foreground">
          Settings & Agent Network
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Autonomous multi-agent orchestration backed by Claude Opus &amp; Sonnet.
        </p>
      </div>

      {/* Account Info */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-mono font-semibold text-base">
            {userName ? userName[0].toUpperCase() : 'U'}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Active Session</h2>
            <div className="text-xs text-muted-foreground">{userEmail || 'Authenticated user'}</div>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] font-mono text-emerald-600 border-emerald-500/30 bg-emerald-500/5">
            Verified
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
            <span className="text-muted-foreground block text-[11px]">Database Provider</span>
            <span className="font-mono font-medium text-foreground">PostgreSQL (Drizzle ORM)</span>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
            <span className="text-muted-foreground block text-[11px]">Tenant Isolation</span>
            <span className="font-mono font-medium text-foreground">Scoped User Repository</span>
          </div>
        </div>
      </div>

      {/* Agents Roster */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Agent Mesh</h2>
            <p className="text-xs text-muted-foreground">
              Specialized LLM roles operating strictly over the deterministic Stats Pack.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs text-primary">
            7 Active Agents
          </Badge>
        </div>

        <div className="mt-5 divide-y divide-border">
          {AGENT_ROSTER.map((a) => {
            const isActive = activeAgentId === a.id
            return (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className={`mt-0.5 sm:mt-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">{a.name}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                        {a.model}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-md">{a.purpose}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono ${isActive ? 'bg-primary/20 text-primary font-semibold' : 'bg-muted text-muted-foreground'}`}>
                    {isActive ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> In Execution
                      </>
                    ) : (
                      <>
                        <Circle className="h-1.5 w-1.5 fill-current text-emerald-500" /> Standing By
                      </>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <>
      <AppShell />
      <Toaster position="bottom-right" richColors />
    </>
  )
}

