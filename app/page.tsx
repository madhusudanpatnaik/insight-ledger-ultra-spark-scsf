'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AuthProvider, LoginForm, RegisterForm, ProtectedRoute, useAuth } from 'lyzr-architect-pg/client'
import { Toaster, toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  FileBarChart, Plus, Settings as SettingsIcon, Sun, Moon, LogOut, Loader2,
  CheckCircle2, Circle, Mail, MessageSquare, Bot, X, Sparkles,
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
  { id: AGENT_IDS.coordinator, name: 'Report Architect Coordinator', purpose: 'Decides report structure, runs the quality review, returns the finished report.' },
  { id: AGENT_IDS.sourceUnderstanding, name: 'Source Understanding Agent', purpose: 'Reads your files and checks whether they can be safely combined.' },
  { id: AGENT_IDS.evidenceAuditor, name: 'Evidence Auditor Agent', purpose: 'Finds what is missing, conflicting or unverified.' },
  { id: AGENT_IDS.insightAnalyst, name: 'Insight Analyst Agent', purpose: 'Turns the numbers into plain-language findings.' },
  { id: AGENT_IDS.qa, name: 'Report Q&A Analyst', purpose: 'Answers follow-up questions about a saved report.' },
  { id: AGENT_IDS.email, name: 'Email Delivery Agent', purpose: 'Drafts and sends the emailed summary.' },
  { id: AGENT_IDS.slack, name: 'Slack Delivery Agent', purpose: 'Drafts and posts the Slack summary.' },
]

type Screen = 'reports' | 'create' | 'report' | 'improve' | 'settings'

// ---------- sample data (shown when Sample Data toggle is ON) ----------
export const SAMPLE_REPORT: ReportRow = {
  id: 'sample-report-1',
  title: 'Q2 quarterly review',
  question: 'Why did sales decline in Q2?',
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
    title: 'Q2 quarterly review',
    period: 'April\u2013June 2025 \u00b7 3 files \u00b7 following Quarterly board format',
    executive_summary: 'Bookings fell 12% over the quarter. The fall is concentrated in enterprise accounts in APAC.',
    overall_confidence: 'moderate',
    cannot_prove: 'Where it happened is settled. Why it happened is not \u2014 these files hold no cost, churn or pricing data, so this report stops at where.',
    sections: [
      {
        heading: 'What happened',
        status: 'supported',
        narrative: 'Bookings fell from $5.48M to $4.82M. The drop was not gradual \u2014 it began in week 7 and held at the lower level for the rest of the quarter.',
        body: null,
        claims: [],
        chart_spec: { type: 'line', caption: 'Bookings fell from week 7 onward and did not recover.', stats_pack_keys: ['metrics.weekly_bookings'] },
      },
      {
        heading: "Why we can't tell yet",
        status: 'cannot_support',
        narrative: 'Your template reports gross margin here. None of the uploaded files contain cost data, so there is nothing to report \u2014 and rather than substitute a proxy, this section stays open.',
        body: 'Add cost per order or product cost to fill this section.',
        claims: [],
        chart_spec: null,
      },
      {
        heading: 'What you should know',
        status: 'supported',
        narrative: '',
        body: null,
        claims: [
          { id: 'c1', text: 'Bookings fell 12%, from $5.48M to $4.82M.', class: 'proven', basis: 'sales.xlsx, 38,940 rows', alternative: null },
          { id: 'c2', text: 'Average order value held at $1,240, so this is a volume story.', class: 'proven', basis: 'sales.xlsx', alternative: null },
          { id: 'c3', text: 'The fall is concentrated in 11 APAC enterprise accounts.', class: 'inferred', basis: 'segment split by region and tier', alternative: 'Eleven accounts is a small base \u2014 two slipped renewals would produce the same pattern.' },
          { id: 'c4', text: 'Did customers leave, or did existing ones spend less?', class: 'unknown', basis: 'no customer-level data present', alternative: 'Customer-level churn data would settle it.' },
        ],
        chart_spec: null,
      },
      { heading: "What you're missing", status: 'supported', narrative: '', body: null, claims: [], chart_spec: null },
      { heading: 'What to do next', status: 'supported', narrative: '', body: null, claims: [], chart_spec: null },
    ],
    gap_ledger: [
      { field: 'customer_level_data', action_phrase: 'Add customer-level data \u2192 could explain the 18% enterprise decline and change 2 conclusions', tier: 'critical', expected_impact: 'high', conclusions_affected: 2, from_template: false },
      { field: 'pricing_history', action_phrase: 'Add pricing history \u2192 would separate price from volume and add 1 conclusion', tier: 'high', expected_impact: 'medium', conclusions_affected: 1, from_template: false },
      { field: 'cost_data', action_phrase: 'Add cost data \u2192 fills the Margin review section your template expects', tier: 'optional', expected_impact: 'low', conclusions_affected: 0, from_template: true },
    ],
    quality_review: {
      claims_rejected: [],
      what_could_mislead_a_skimmer: 'Average order value held steady, which could look like nothing changed \u2014 the decline is entirely in volume, concentrated regionally.',
      what_we_missed: 'Customer-level retention records.',
    },
    charts: [{ type: 'line', caption: 'Bookings fell from week 7 onward and did not recover.', stats_pack_keys: ['metrics.weekly_bookings'] }],
    evidence_strength: { proven_count: 2, inferred_count: 1, unknown_count: 1, basis_summary: 'Two proven findings, one inferred with a stated alternative, one open question.' },
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
    title: 'Q1 quarterly review',
    version: 1,
    evidence_strength: 64,
    created_at: new Date(2025, 2, 30).toISOString(),
    report_json: { ...SAMPLE_REPORT.report_json!, title: 'Q1 quarterly review', period: 'January\u2013March 2025' },
  },
]

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="mt-3 text-sm font-semibold">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="mt-3 text-base font-semibold">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="mt-4 text-lg font-bold">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part))
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

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileBarChart className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Evidence</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your data, explained \u2014 honestly.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {isLogin ? (
            <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
          )}
        </div>
      </div>
    </div>
  )
}

function RailLink({ icon, label, active, dominant, onClick }: { icon: React.ReactNode; label: string; active?: boolean; dominant?: boolean; onClick: () => void }) {
  if (dominant) {
    return (
      <button
        onClick={onClick}
        className="mx-3 mt-2 flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:opacity-90 active:scale-[0.98]"
      >
        {icon}
        <span>{label}</span>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`mx-2 flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function AppShell() {
  const { user, logout, authFetch } = useAuth()
  const { dark, toggle } = useThemeToggle()
  const [screen, setScreen] = useState<Screen>('reports')
  const [sampleData, setSampleData] = useState(true)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [activeReport, setActiveReport] = useState<ReportRow | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const seeded = useRef(false)

  const loadReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await authFetch('/api/reports')
      const data = await res.json()
      if (data.success) setReports(Array.isArray(data.data) ? data.data : [])
      else toast.error(data.error ?? 'Could not load reports')
    } catch (err: any) {
      toast.error(err?.message ?? 'Network error loading reports')
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
    <div className="grid min-h-screen grid-cols-[64px_1fr] bg-background text-foreground sm:grid-cols-[200px_1fr]">
      <Toaster richColors position="top-right" />
      <nav className="flex flex-col gap-1 border-r border-sidebar-border bg-sidebar py-5 text-sidebar-foreground">
        <div className="hidden px-4 pb-5 sm:block">
          <div className="text-base font-semibold text-sidebar-foreground">Evidence</div>
          <div className="mt-0.5 text-[11px] text-sidebar-foreground/60">your data, explained</div>
        </div>
        <div className="flex justify-center pb-4 sm:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileBarChart className="h-4 w-4" />
          </div>
        </div>
        <RailLink icon={<FileBarChart className="h-4 w-4 shrink-0" />} label="Reports" active={screen === 'reports'} onClick={() => setScreen('reports')} />
        <RailLink icon={<Plus className="h-4 w-4 shrink-0" />} label="New report" dominant onClick={() => setScreen('create')} />
        <RailLink icon={<SettingsIcon className="h-4 w-4 shrink-0" />} label="Settings" active={screen === 'settings'} onClick={() => setScreen('settings')} />
        <div className="mt-auto flex flex-col gap-2 px-2 pt-4">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
          >
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button
            onClick={() => logout()}
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/40"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </nav>

      <main className="min-h-screen min-w-0 overflow-y-auto">
        <div className="flex items-center justify-end gap-2 border-b border-border bg-card px-4 py-2.5 sm:px-6">
          <span className="text-xs text-muted-foreground">Sample Data</span>
          <Switch checked={sampleData} onCheckedChange={setSampleData} aria-label="Sample Data toggle" />
        </div>

        {screen === 'reports' && (
          <ReportsListScreen
            reports={displayReports}
            loading={loadingReports}
            onOpen={openReport}
            onNew={() => setScreen('create')}
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
        {screen === 'settings' && <SettingsScreen userEmail={user?.email ?? ''} userName={user?.name ?? ''} activeAgentId={activeAgentId} />}
        {(screen === 'report' || screen === 'improve') && !activeReport && (
          <div className="flex min-h-[60vh] items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm text-muted-foreground">No report is open yet.</p>
              <Button className="mt-4" onClick={() => setScreen('reports')}>Back to reports</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function ReportsListScreen({ reports, loading, onOpen, onNew }: { reports: ReportRow[]; loading: boolean; onOpen: (r: ReportRow) => void; onNew: () => void }) {
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileBarChart className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-balance">Drop a file, get a readable answer</h2>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          Evidence computes every number itself, then tells you plainly what the data proves, what it suggests, and what it cannot answer yet.
        </p>
        <Button className="mt-6 min-h-[40px]" onClick={onNew}>
          <Plus className="mr-1.5 h-4 w-4" /> New report
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">Try it with the sample dataset via the Sample Data toggle above.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Reports</h1>
        <Button onClick={onNew} className="hidden sm:inline-flex">
          <Plus className="mr-1.5 h-4 w-4" /> New report
        </Button>
      </div>
      <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {reports.map((r) => {
          const missing = r.report_json?.gap_ledger?.filter((g) => !!g)?.length ?? 0
          return (
            <button
              key={r.id}
              onClick={() => onOpen(r)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{r.title}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.report_json?.period ?? 'Period not detected'} \u00b7 v{r.version}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-right">
                <div>
                  <div className="font-mono text-sm tabular-nums text-foreground">{r.evidence_strength}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">strength</div>
                </div>
                <div>
                  <div className="font-mono text-sm tabular-nums text-foreground">{missing}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">missing</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SettingsScreen({ userEmail, userName, activeAgentId }: { userEmail: string; userName: string; activeAgentId: string | null }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Account</h2>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="text-foreground">{userName || '\u2014'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-foreground">{userEmail || '\u2014'}</span></div>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Agents powering Evidence</h2>
        <p className="mt-1 text-xs text-muted-foreground">Each report is produced by these specialists working over your computed numbers.</p>
        <div className="mt-3 divide-y divide-border">
          {AGENT_ROSTER.map((a) => {
            const isActive = activeAgentId === a.id
            return (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.purpose}</div>
                  </div>
                </div>
                <span className={`flex shrink-0 items-center gap-1.5 text-xs ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-2 w-2 fill-current" />}
                  {isActive ? 'Working' : 'Idle'}
                </span>
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
    <AuthProvider>
      <ProtectedRoute unauthenticatedFallback={<AuthScreen />}>
        <AppShell />
      </ProtectedRoute>
    </AuthProvider>
  )
}
