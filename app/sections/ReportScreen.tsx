'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ArrowLeft, Download, Send, MessageSquare, ChevronRight, Loader2, CheckCircle2,
  AlertCircle, History, Mail, MessageCircle as SlackIcon, X, Info, Circle,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import { AGENT_IDS, renderMarkdown } from '@/app/page'
import {
  type ReportRow, type Claim, type ClaimClass, type ReportSection, type GapLedgerItem,
  type AuthFetch, type CompatibilityCheckClient, normalizeReportJson, computeEvidenceStrength,
} from '@/app/sections/evidenceLib'

interface ReportScreenProps {
  report: ReportRow
  authFetch: AuthFetch
  userId: string
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  onReportUpdated: (r: ReportRow) => void
  onBack: () => void
  onImprove: () => void
  sampleData: boolean
}

interface ResolutionRow {
  id: string
  report_id: string
  target_type: string
  target_id: string | null
  action: string
  chosen_value: string | null
  reason: string | null
  basis: string | null
  applied_in_version: number | null
  created_at?: string
}

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function classLabel(c: ClaimClass) {
  if (c === 'proven') return 'proven'
  if (c === 'inferred') return 'inferred'
  return 'unknown'
}
function classClasses(c: ClaimClass) {
  if (c === 'proven') return 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
  if (c === 'inferred') return 'border-violet-300/60 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400'
  return 'border-amber-300/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
}

function ClaimLine({ claim }: { claim: Claim }) {
  return (
    <div className="max-w-[68ch] border-b border-border py-2.5 last:border-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className="text-[14.5px] text-foreground">{claim.text}</span>
        <span className={`inline-block w-fit shrink-0 rounded border px-1.5 py-px text-[11px] ${classClasses(claim.class)}`}>{classLabel(claim.class)}</span>
      </div>
      {claim.class !== 'proven' && claim.alternative && (
        <div className="mt-1 text-[13.5px] text-muted-foreground">
          {claim.class === 'inferred' ? "Can't rule out: " : ''}{claim.alternative}
        </div>
      )}
    </div>
  )
}

function MiniChart({ values, caption }: { values: number[]; caption: string }) {
  if (!Array.isArray(values) || values.length < 2) return null
  const w = 640, h = 160, pad = 28
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-border" />
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2.4} className="text-primary" />
      </svg>
      <div className="mt-2 text-xs text-muted-foreground">{caption}</div>
    </div>
  )
}

function StrengthBreakdown({ report }: { report: ReportRow }) {
  const comp = report.strength_components || {}
  const rows: [string, number][] = [
    ['Data completeness', comp.data_completeness ?? 0],
    ['Source consistency', comp.source_consistency ?? 0],
    ['Evidence coverage', comp.evidence_coverage ?? 0],
    ['Analytical coverage', comp.analytical_coverage ?? 0],
    ['Freshness', comp.freshness ?? 0],
  ]
  const max: Record<string, number> = { 'Data completeness': 25, 'Source consistency': 20, 'Evidence coverage': 25, 'Analytical coverage': 20, Freshness: 10 }
  const weakest = rows.reduce((a, b) => (a[1] / (max[a[0]] || 1) < b[1] / (max[b[0]] || 1) ? a : b))
  return (
    <div className="w-72 space-y-2.5 p-1">
      <p className="text-xs text-muted-foreground">How well the available evidence supports this report.</p>
      {rows.map(([label, val]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(val / (max[label] || 1)) * 100}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right font-mono tabular-nums text-foreground">{val}/{max[label]}</span>
        </div>
      ))}
      <div className="border-t border-border pt-2 text-xs text-muted-foreground">
        Raising it most: strengthen <span className="font-medium text-foreground">{weakest[0].toLowerCase()}</span>.
      </div>
    </div>
  )
}

export default function ReportScreen({ report, authFetch, userId, activeAgentId, setActiveAgentId, onReportUpdated, onBack, onImprove, sampleData }: ReportScreenProps) {
  const isSample = report.id.startsWith('sample-')
  const rj = report.report_json
  const [showEvidence, setShowEvidence] = useState(false)
  const [resolutions, setResolutions] = useState<ResolutionRow[]>([])
  const [localAccepted, setLocalAccepted] = useState<Record<string, boolean>>({})
  const [updating, setUpdating] = useState(false)
  const [qaOpen, setQaOpen] = useState(false)
  const [qaQuestion, setQaQuestion] = useState('')
  const [qaThread, setQaThread] = useState<{ sender: 'user' | 'agent'; content: string; class?: ClaimClass; basis?: string[]; related_gap?: string | null }[]>([])
  const [qaLoading, setQaLoading] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const loadResolutions = useCallback(async () => {
    if (isSample) return
    try {
      const res = await authFetch(`/api/resolutions?report_id=${report.id}`)
      const data = await res.json()
      if (data.success) setResolutions(Array.isArray(data.data) ? data.data : [])
    } catch {}
  }, [authFetch, report.id, isSample])

  useEffect(() => { loadResolutions() }, [loadResolutions])

  const compatibility: CompatibilityCheckClient[] = report.stats_pack?.compatibility ?? []
  const pendingCompatIdx = compatibility
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.verdict !== 'compatible' && !resolutions.some((r) => r.target_id === `compat-${i}`) && !localAccepted[`compat-${i}`])

  const pendingCount = isSample
    ? Object.keys(localAccepted).length
    : resolutions.filter((r) => r.applied_in_version == null).length

  const acceptRecommendation = async (targetId: string, basisText: string) => {
    if (isSample) {
      setLocalAccepted((prev) => ({ ...prev, [targetId]: true }))
      toast.success('Decision recorded')
      return
    }
    try {
      const res = await authFetch('/api/resolutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: report.id,
          target_type: 'compatibility',
          target_id: targetId,
          action: 'accept_recommendation',
          basis: basisText,
          decided_by: userId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Decision recorded')
        loadResolutions()
      } else toast.error(data.error ?? 'Could not record the decision')
    } catch (err: any) {
      toast.error(err?.message ?? 'Network error recording the decision')
    }
  }

  const buildAgentMessage = (instruction: string, extra: Record<string, any> = {}) => JSON.stringify({
    instruction,
    question: report.question ?? null,
    stats_pack: report.stats_pack,
    previous_report: rj,
    ...extra,
  })

  const handleUpdateReport = async () => {
    if (pendingCount === 0) return
    setUpdating(true)
    setActiveAgentId(AGENT_IDS.coordinator)
    try {
      const pendingResolutions = isSample
        ? Object.keys(localAccepted).map((k) => ({ target_id: k, action: 'accept_recommendation' }))
        : resolutions.filter((r) => r.applied_in_version == null)
      const message = buildAgentMessage(
        'Update the report. Apply the attached pending resolutions as binding constraints, regenerate the affected sections and claims, and return the full report JSON plus a change_summary describing exactly what changed (claims_added, claims_removed, claims_reworded, confidence_moved, gaps_closed, gaps_raised).',
        { pending_resolutions: pendingResolutions }
      )
      const result = await callAIAgent(message, AGENT_IDS.coordinator)
      if (!result.success || result.response?.status !== 'success') {
        toast.error(result.response?.message ?? 'Update failed')
        return
      }
      const newReportJson = normalizeReportJson(result.response.result)
      if (!newReportJson) {
        toast.error('The updated report came back in an unexpected shape.')
        return
      }
      const { total, components } = computeEvidenceStrength(report.stats_pack?.profiles ?? [], newReportJson.gap_ledger ?? [], compatibility)
      if (isSample) {
        onReportUpdated({
          ...report,
          report_json: newReportJson,
          evidence_strength: total,
          strength_components: components,
          version: report.version + 1,
          change_summary: newReportJson.change_summary,
        })
        setLocalAccepted({})
        toast.success(`Updated to version ${report.version + 1}`)
        return
      }
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newReportJson.title || report.title,
          question: report.question,
          dataset_ids: report.dataset_ids,
          stats_pack: report.stats_pack,
          report_json: newReportJson,
          evidence_strength: total,
          strength_components: components,
          version: report.version + 1,
          parent_report_id: report.id,
          change_summary: newReportJson.change_summary,
          status: 'current',
        }),
      })
      const data = await res.json()
      if (data.success) {
        await authFetch('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: report.id, status: 'superseded' }) })
        for (const r of resolutions.filter((r) => r.applied_in_version == null)) {
          await authFetch('/api/resolutions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, applied_in_version: report.version + 1 }) })
        }
        onReportUpdated(data.data)
        toast.success(`Updated to version ${report.version + 1}`)
      } else toast.error(data.error ?? 'Could not save the updated report')
    } catch (err: any) {
      toast.error(err?.message ?? 'Network error updating the report')
    } finally {
      setUpdating(false)
      setActiveAgentId(null)
    }
  }

  const handleAskQuestion = async () => {
    if (!qaQuestion.trim()) return
    const q = qaQuestion.trim()
    setQaThread((prev) => [...prev, { sender: 'user', content: q }])
    setQaQuestion('')
    setQaLoading(true)
    setActiveAgentId(AGENT_IDS.qa)
    try {
      const message = JSON.stringify({
        question: q,
        stats_pack: report.stats_pack,
        report: rj,
        resolutions: isSample ? [] : resolutions,
      })
      const result = await callAIAgent(message, AGENT_IDS.qa)
      if (!result.success || result.response?.status !== 'success') {
        toast.error(result.response?.message ?? 'The question could not be answered')
        return
      }
      const data = result.response.result
      if (!data || typeof data.answer !== 'string' || typeof data.class !== 'string') {
        toast.error('The answer came back in an unexpected shape.')
        return
      }
      setQaThread((prev) => [...prev, { sender: 'agent', content: data.answer, class: data.class, basis: Array.isArray(data.basis) ? data.basis : [], related_gap: data.related_gap ?? null }])
      if (!isSample) {
        await authFetch('/api/report-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: report.id, sender: 'user', content: q }) })
        await authFetch('/api/report-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: report.id, sender: 'agent', content: data.answer }) })
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Network error asking the question')
    } finally {
      setQaLoading(false)
      setActiveAgentId(null)
    }
  }

  const handleDownloadPdf = async () => {
    if (!rj) return
    setDownloadingPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt' })
      let y = 56
      const left = 48
      const width = 500
      doc.setFontSize(18)
      doc.text(rj.title || 'Report', left, y); y += 22
      doc.setFontSize(10)
      doc.setTextColor(110)
      doc.text(`${rj.period || ''}  \u00b7  Evidence strength ${report.evidence_strength}  \u00b7  v${report.version}`, left, y); y += 24
      doc.setTextColor(20)
      doc.setFontSize(12)
      const summaryLines = doc.splitTextToSize(rj.executive_summary || '', width)
      doc.text(summaryLines, left, y); y += summaryLines.length * 14 + 12
      for (const section of rj.sections || []) {
        if (y > 740) { doc.addPage(); y = 56 }
        doc.setFontSize(13)
        doc.setTextColor(10)
        doc.text(section.heading, left, y); y += 16
        doc.setFontSize(10.5)
        doc.setTextColor(60)
        const bodyText = section.narrative || section.body || ''
        if (bodyText) {
          const lines = doc.splitTextToSize(bodyText, width)
          doc.text(lines, left, y); y += lines.length * 13 + 6
        }
        for (const claim of section.claims || []) {
          if (y > 760) { doc.addPage(); y = 56 }
          const lines = doc.splitTextToSize(`\u2022 ${claim.text} [${claim.class}]`, width)
          doc.text(lines, left, y); y += lines.length * 12.5 + 2
        }
        y += 8
      }
      if (y > 700) { doc.addPage(); y = 56 }
      doc.setFontSize(13)
      doc.setTextColor(10)
      doc.text("What you're missing", left, y); y += 16
      doc.setFontSize(10.5)
      doc.setTextColor(60)
      for (const gap of rj.gap_ledger || []) {
        const lines = doc.splitTextToSize(`\u2022 ${gap.action_phrase}`, width)
        doc.text(lines, left, y); y += lines.length * 12.5 + 2
      }
      doc.save(`${(rj.title || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-v${report.version}.pdf`)
      toast.success('PDF downloaded')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not generate the PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (!rj) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8 text-center">
        <div>
          <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-3 text-sm text-muted-foreground">This report has no content yet.</p>
          <Button className="mt-4" onClick={onBack}>Back to reports</Button>
        </div>
      </div>
    )
  }

  const whatHappened = rj.sections.find((s) => s.heading.toLowerCase().startsWith('what happened'))
  const whySection = rj.sections.find((s) => /^why/i.test(s.heading))
  const knowSection = rj.sections.find((s) => s.heading.toLowerCase().includes('should know'))
  const missingSection = rj.sections.find((s) => s.heading.toLowerCase().includes('missing'))
  const nextSection = rj.sections.find((s) => s.heading.toLowerCase().includes('next'))
  const otherSections = rj.sections.filter((s) => ![whatHappened, whySection, knowSection, missingSection, nextSection].includes(s))

  const gapDot = (tier: string) => (tier === 'critical' ? 'bg-destructive' : tier === 'high' ? 'bg-amber-500' : 'bg-muted-foreground')

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-card px-4 pb-4 pt-5 sm:px-6">
        <div className="mx-auto flex max-w-[790px] flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <button onClick={onBack} className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Reports
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[26px]">{rj.title}</h1>
            <div className="mt-1 text-[13.5px] text-muted-foreground">{rj.period}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm">
              <span className="text-foreground">Evidence strength</span>
              <span className="h-1.5 w-[130px] overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${report.evidence_strength}%` }} />
              </span>
              <span className="font-mono font-semibold tabular-nums text-foreground">{report.evidence_strength}</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-[13px] text-primary hover:underline">How is this calculated?</button>
                </PopoverTrigger>
                <PopoverContent align="start"><StrengthBreakdown report={report} /></PopoverContent>
              </Popover>
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">How well the available evidence supports this report.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowEvidence((v) => !v)}
              className="flex min-h-[40px] items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[13.5px] transition-colors hover:bg-muted"
            >
              <Switch checked={showEvidence} onCheckedChange={setShowEvidence} className="pointer-events-none" />
              Show evidence
            </button>
            <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf} className="min-h-[40px]">
              {downloadingPdf ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => setShareOpen(true)} className="min-h-[40px]">
              <Send className="mr-1.5 h-4 w-4" /> Send report
            </Button>
            <Button onClick={() => setQaOpen(true)} className="min-h-[40px]">
              <MessageSquare className="mr-1.5 h-4 w-4" /> Ask a question
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[790px] px-4 pb-20 sm:px-6">
        {pendingCount > 0 && (
          <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-col gap-3 bg-[#0F2830] px-4 py-3 text-[#DCE8EA] sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <b className="text-white">{pendingCount} decision{pendingCount === 1 ? '' : 's'} applied</b>
              <div className="mt-0.5 text-[12.5px] text-[#93B0B7]">The report rebuilds once, when you&apos;re ready.</div>
            </div>
            <Button onClick={handleUpdateReport} disabled={updating} className="min-h-[40px] w-full bg-accent text-accent-foreground hover:opacity-90 sm:w-auto">
              {updating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Update report
            </Button>
          </div>
        )}

        <p className="max-w-[58ch] text-[21px] font-medium leading-[1.5] text-balance">{rj.executive_summary}</p>
        {rj.cannot_prove && <p className="mt-3 max-w-[64ch] text-[15px] text-muted-foreground">{rj.cannot_prove}</p>}

        {pendingCompatIdx.map(({ c, i }) => (
          <div key={i} className="mt-5 rounded-lg border border-border border-l-[3px] border-l-accent bg-card p-4 sm:p-[18px]">
            <b className="block text-[15.5px] text-foreground">
              {c.verdict === 'incompatible' ? `I can't combine ${c.pair[0]} and ${c.pair[1]}'s figures` : `${c.pair[0]} and ${c.pair[1]} measure time differently`}
            </b>
            <p className="mt-1.5 max-w-[62ch] text-sm text-muted-foreground">{c.reconciliation}</p>
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              {c.verdict !== 'incompatible' && (
                <Button size="sm" onClick={() => acceptRecommendation(`compat-${i}`, c.reconciliation ?? '')}>Use rolled-up figure</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setSourceOpen(true)}>Review sources</Button>
            </div>
          </div>
        ))}

        {whatHappened && (
          <section className="mt-9">
            <h3 className="flex items-baseline justify-between gap-3 border-b border-foreground pb-1.5 text-[15px] font-semibold">
              {whatHappened.heading}
            </h3>
            {whatHappened.narrative && <p className="mt-3.5 max-w-[66ch] text-[15px]">{whatHappened.narrative}</p>}
            {whatHappened.chart_spec ? (
              (() => {
                const key = whatHappened.chart_spec.stats_pack_keys?.[0]
                const values = key ? getByPath(report.stats_pack, key) : null
                return Array.isArray(values) && values.length > 1
                  ? <MiniChart values={values} caption={whatHappened.chart_spec.caption} />
                  : <div className="mt-3 text-[13px] italic text-muted-foreground">No visualization needed here.</div>
              })()
            ) : (
              <div className="mt-3 text-[13px] italic text-muted-foreground">No visualization needed here.</div>
            )}
          </section>
        )}

        {whySection && (
          <section className={`mt-9 ${whySection.status === 'cannot_support' ? '' : ''}`}>
            <h3 className={`flex items-baseline justify-between gap-3 border-b pb-1.5 text-[15px] font-semibold ${whySection.status === 'cannot_support' ? 'border-amber-500' : 'border-foreground'}`}>
              {whySection.heading}
            </h3>
            {whySection.status === 'cannot_support' ? (
              <div className="mt-3.5 border-l-[3px] border-amber-500 bg-amber-50/60 p-4 dark:bg-amber-950/10">
                <p className="max-w-[64ch] text-[15px]">{whySection.narrative}</p>
                {whySection.body && <div className="mt-2.5 text-[13.5px] text-primary">{whySection.body}</div>}
              </div>
            ) : (
              <>
                {whySection.narrative && <p className="mt-3.5 max-w-[66ch] text-[15px]">{whySection.narrative}</p>}
                {whySection.chart_spec && (() => {
                  const key = whySection.chart_spec.stats_pack_keys?.[0]
                  const values = key ? getByPath(report.stats_pack, key) : null
                  return Array.isArray(values) && values.length > 1 ? <MiniChart values={values} caption={whySection.chart_spec.caption} /> : null
                })()}
              </>
            )}
          </section>
        )}

        {otherSections.map((s, idx) => (
          <section key={idx} className="mt-9">
            <h3 className="flex items-baseline justify-between gap-3 border-b border-foreground pb-1.5 text-[15px] font-semibold">
              {s.heading}
              <em className="whitespace-nowrap text-[12.5px] font-normal not-italic text-muted-foreground">{s.status === 'cannot_support' ? "we can't fill it yet" : ''}</em>
            </h3>
            {s.status === 'cannot_support' ? (
              <div className="mt-3.5 border-l-[3px] border-amber-500 bg-amber-50/60 p-4 dark:bg-amber-950/10">
                <p className="max-w-[64ch] text-[15px]">{s.narrative}</p>
                {s.body && <div className="mt-2.5 text-[13.5px] text-primary">{s.body}</div>}
              </div>
            ) : (
              <p className="mt-3.5 max-w-[66ch] text-[15px]">{s.narrative}</p>
            )}
          </section>
        ))}

        {knowSection && (
          <section className="mt-9">
            <h3 className="flex items-baseline justify-between gap-3 border-b border-foreground pb-1.5 text-[15px] font-semibold">
              {knowSection.heading}
              <em className="whitespace-nowrap text-[12.5px] font-normal not-italic text-muted-foreground">every line labelled</em>
            </h3>
            {knowSection.claims.length === 0 ? (
              <p className="mt-3.5 text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <>
                <div className="mt-3.5 text-[13px] italic text-muted-foreground">No chart here \u2014 these are single facts, and the sentences carry them.</div>
                <div className="mt-1">
                  {knowSection.claims.map((c) => <ClaimLine key={c.id} claim={c} />)}
                </div>
              </>
            )}
          </section>
        )}

        {missingSection && (
          <section className="mt-9">
            <h3 className="flex items-baseline justify-between gap-3 border-b border-foreground pb-1.5 text-[15px] font-semibold">
              {missingSection.heading}
              <em className="whitespace-nowrap text-[12.5px] font-normal not-italic text-muted-foreground">each one is an instruction</em>
            </h3>
            {(rj.gap_ledger || []).slice(0, 3).map((gap, i) => {
              const [action, payoff] = gap.action_phrase.split('\u2192')
              return (
                <div key={i} className="mt-3 grid grid-cols-[12px_1fr] items-start gap-3.5 rounded-lg border border-border bg-card p-4">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${gapDot(gap.tier)}`} />
                  <div>
                    <div className="max-w-[62ch] text-[15.5px] font-semibold">
                      {action?.trim()} <span className="text-destructive">\u2192</span> {payoff?.trim()}
                    </div>
                    {gap.why_it_matters && <p className="mt-1.5 max-w-[60ch] text-sm text-muted-foreground">{gap.why_it_matters}</p>}
                    {gap.unlocks_question && <div className="mt-1.5 text-sm text-primary">Would answer: {gap.unlocks_question}</div>}
                    {gap.needs && <div className="mt-1.5 text-xs text-muted-foreground">Needs: {gap.needs}</div>}
                  </div>
                </div>
              )
            })}
            <div className="mt-4">
              <Button size="lg" onClick={onImprove} className="min-h-[44px]">Improve report</Button>
            </div>
          </section>
        )}

        {nextSection && (
          <section className="mt-9">
            <h3 className="border-b border-foreground pb-1.5 text-[15px] font-semibold">{nextSection.heading}</h3>
            <ol className="mt-3.5">
              {(nextSection.narrative ? nextSection.narrative.split(/\n+/).filter(Boolean) : []).map((line, i) => (
                <li key={i} className="relative max-w-[64ch] border-b border-border py-2.5 pl-7 text-[15px] last:border-0">
                  <span className="absolute left-0 top-2.5 text-[13.5px] text-muted-foreground">{i + 1}</span>
                  {line.replace(/^\d+[\.\)]\s*/, '')}
                </li>
              ))}
              {!nextSection.narrative && <li className="py-2.5 text-sm text-muted-foreground">No further actions listed.</li>}
            </ol>
          </section>
        )}

        {showEvidence && (
          <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:p-[17px]">
            <h5 className="mb-2.5 text-xs font-medium text-muted-foreground">With &quot;Show evidence&quot; on, the same page adds this \u2014 nothing moves</h5>
            {rj.sections.flatMap((s) => s.claims).map((c) => (
              <div key={c.id} className="border-b border-border py-1.5 text-[13.5px] text-muted-foreground last:border-0">
                <b className="text-foreground">{c.text}</b> \u00b7 {c.class} \u00b7 {c.basis}
              </div>
            ))}
            {compatibility.map((c, i) => (
              <div key={i} className="border-b border-border py-1.5 text-[13.5px] text-muted-foreground last:border-0">
                <b className="text-foreground">Compatibility</b> \u00b7 {c.pair.join(' vs ')} \u00b7 {c.verdict}{c.reconciliation ? ` \u00b7 ${c.reconciliation}` : ''}
              </div>
            ))}
            {!isSample && resolutions.filter((r) => r.applied_in_version != null).map((r) => (
              <div key={r.id} className="border-b border-border py-1.5 text-[13.5px] text-muted-foreground last:border-0">
                <b className="text-foreground">Settled</b> \u00b7 {r.action} \u00b7 applied in v{r.applied_in_version}
              </div>
            ))}
            <button onClick={() => setHistoryOpen(true)} className="mt-2.5 flex items-center gap-1.5 text-[13px] text-primary hover:underline">
              <History className="h-3.5 w-3.5" /> View version history
            </button>
          </div>
        )}
      </div>

      {/* Ask a question sheet */}
      <Sheet open={qaOpen} onOpenChange={setQaOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Ask a question</SheetTitle>
            <SheetDescription>Answers are scoped to this report&apos;s figures. If it can&apos;t answer, it points to what&apos;s missing.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {qaThread.length === 0 && <p className="text-sm text-muted-foreground">No questions yet. Try &quot;Was the decline worse in any one region?&quot;</p>}
            {qaThread.map((m, i) => (
              <div key={i} className={m.sender === 'user' ? 'ml-6 rounded-lg bg-primary/10 p-3 text-sm' : 'mr-2 rounded-lg border border-border bg-card p-3 text-sm'}>
                {m.sender === 'user' ? (
                  <p>{m.content}</p>
                ) : (
                  <>
                    {renderMarkdown(m.content)}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {m.class && <span className={`rounded border px-1.5 py-px text-[11px] ${classClasses(m.class)}`}>{classLabel(m.class)}</span>}
                    </div>
                    {m.basis && m.basis.length > 0 && (
                      <ul className="mt-1.5 list-disc pl-4 text-xs text-muted-foreground">{m.basis.map((b, bi) => <li key={bi}>{b}</li>)}</ul>
                    )}
                    {m.related_gap && <div className="mt-1.5 text-xs text-primary">Related gap: {m.related_gap}</div>}
                  </>
                )}
              </div>
            ))}
            {qaLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking\u2026</div>}
          </div>
          <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
            <Textarea value={qaQuestion} onChange={(e) => setQaQuestion(e.target.value)} placeholder="Ask about this report\u2026" className="min-h-[44px] flex-1 resize-none" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskQuestion() } }} />
            <Button onClick={handleAskQuestion} disabled={qaLoading || !qaQuestion.trim()} size="icon" className="h-11 w-11 shrink-0">
              {qaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        report={report}
        pendingCount={pendingCount}
        authFetch={authFetch}
        userId={userId}
        setActiveAgentId={setActiveAgentId}
        isSample={isSample}
      />

      <SourceDrawer open={sourceOpen} onOpenChange={setSourceOpen} report={report} resolutions={resolutions} />
      <VersionHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} report={report} authFetch={authFetch} isSample={isSample} />
    </div>
  )
}

function ShareDialog({ open, onOpenChange, report, pendingCount, authFetch, userId, setActiveAgentId, isSample }: {
  open: boolean; onOpenChange: (v: boolean) => void; report: ReportRow; pendingCount: number; authFetch: AuthFetch; userId: string; setActiveAgentId: (id: string | null) => void; isSample: boolean
}) {
  const [channel, setChannel] = useState<'email' | 'slack'>('email')
  const [recipients, setRecipients] = useState('')
  const [channelName, setChannelName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [state, setState] = useState<'idle' | 'drafting' | 'ready' | 'sending' | 'sent' | 'failed'>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setState('idle'); setSubject(''); setBody(''); setWarnings([]); setErrorText(null) }
  }, [open])

  const rj = report.report_json

  const handleDraft = async () => {
    if (!rj) return
    setState('drafting')
    setErrorText(null)
    const agentId = channel === 'email' ? '6a9d0d230c845399eac15886' : '6a9d0d23598b068e18814dc9'
    setActiveAgentId(agentId)
    try {
      const message = JSON.stringify({
        instruction: `Draft only \u2014 do not send yet. Write a short covering ${channel === 'email' ? 'email' : 'Slack message'} for this report: lead with the headline finding, evidence strength, open critical gaps, and version. Quote no number the report does not contain.`,
        report_title: rj.title,
        period: rj.period,
        headline: rj.executive_summary,
        evidence_strength: report.evidence_strength,
        open_critical_gaps: (rj.gap_ledger || []).filter((g) => g.tier === 'critical').map((g) => g.action_phrase),
        version: report.version,
      })
      const result = await callAIAgent(message, agentId)
      if (!result.success || result.response?.status !== 'success') {
        setState('failed'); setErrorText(result.response?.message ?? 'Could not draft the message'); return
      }
      const data = result.response.result
      if (!data || typeof data.body !== 'string') { setState('failed'); setErrorText('Draft came back in an unexpected shape.'); return }
      setSubject(typeof data.subject === 'string' ? data.subject : `${rj.title} \u2014 v${report.version}`)
      setBody(data.body)
      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setState('ready')
    } catch (err: any) {
      setState('failed'); setErrorText(err?.message ?? 'Network error drafting the message')
    } finally {
      setActiveAgentId(null)
    }
  }

  const handleSend = async () => {
    if (pendingCount > 0) { toast.error('Update the report first, or confirm sending this version anyway.'); return }
    setState('sending')
    setErrorText(null)
    const agentId = channel === 'email' ? '6a9d0d230c845399eac15886' : '6a9d0d23598b068e18814dc9'
    setActiveAgentId(agentId)
    try {
      const message = JSON.stringify({
        instruction: `Send now using the approved text below via your tool. Do not redraft.`,
        channel,
        recipients: channel === 'email' ? recipients.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        slack_channel: channel === 'slack' ? channelName : undefined,
        subject,
        body,
        report_title: rj?.title,
      })
      const result = await callAIAgent(message, agentId)
      const ok = result.success && result.response?.status === 'success'
      if (!isSample) {
        await authFetch('/api/deliveries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_id: report.id,
            report_version: report.version,
            channel,
            recipients: channel === 'email' ? recipients.split(',').map((s) => s.trim()).filter(Boolean) : [channelName],
            message_body: body,
            sent_by: userId,
            status: ok ? 'sent' : 'failed',
            error_detail: ok ? null : (result.response?.message ?? 'Delivery failed'),
            sent_at: ok ? new Date().toISOString() : null,
          }),
        })
      }
      if (ok) { setState('sent'); toast.success(`Sent via ${channel}`) }
      else { setState('failed'); setErrorText(result.response?.message ?? `Delivery via ${channel} failed`) }
    } catch (err: any) {
      setState('failed'); setErrorText(err?.message ?? 'Network error sending')
    } finally {
      setActiveAgentId(null)
    }
  }

  const canSend = channel === 'email' ? recipients.trim().length > 0 : channelName.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send report</DialogTitle>
          <DialogDescription>Only figures already in the report may appear in the message.</DialogDescription>
        </DialogHeader>

        <Tabs value={channel} onValueChange={(v) => setChannel(v as 'email' | 'slack')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email"><Mail className="mr-1.5 h-3.5 w-3.5" /> Email</TabsTrigger>
            <TabsTrigger value="slack"><SlackIcon className="mr-1.5 h-3.5 w-3.5" /> Slack</TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="mt-3 space-y-2">
            <label className="text-xs text-muted-foreground">Recipients (comma separated)</label>
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="jane@company.com, board@company.com" />
          </TabsContent>
          <TabsContent value="slack" className="mt-3 space-y-2">
            <label className="text-xs text-muted-foreground">Channel name or ID</label>
            <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="#board-updates" />
          </TabsContent>
        </Tabs>

        {pendingCount > 0 && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
            This report has {pendingCount} pending decision{pendingCount === 1 ? '' : 's'}. Update it first, or send this version anyway.
          </div>
        )}

        {state === 'idle' && (
          <Button onClick={handleDraft} disabled={!canSend} className="w-full">Draft message</Button>
        )}
        {state === 'drafting' && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Drafting\u2026</div>
        )}
        {(state === 'ready' || state === 'sending' || state === 'sent' || state === 'failed') && (
          <div className="space-y-2">
            {channel === 'email' && <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[160px]" />
            {warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-700">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            )}
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Preview: {channel === 'email' ? `PDF "${rj?.title}-v${report.version}.pdf" attached` : `Link to "${rj?.title}" (v${report.version}) included`}
            </div>
          </div>
        )}
        {state === 'failed' && errorText && <div className="text-sm text-destructive">{errorText}</div>}
        {state === 'sent' && <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Sent</div>}

        <DialogFooter>
          {(state === 'ready' || state === 'failed') && (
            <Button onClick={handleSend} disabled={!canSend}>Send</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourceDrawer({ open, onOpenChange, report, resolutions }: { open: boolean; onOpenChange: (v: boolean) => void; report: ReportRow; resolutions: ResolutionRow[] }) {
  const profiles = report.stats_pack?.profiles ?? []
  const compatibility: CompatibilityCheckClient[] = report.stats_pack?.compatibility ?? []
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Sources</SheetTitle>
          <SheetDescription>Column-level profile, document provenance, and compatibility verdicts.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-6">
          {profiles.filter((p: any) => p.columns?.length).map((p: any) => (
            <div key={p.name}>
              <div className="text-sm font-medium text-foreground">{p.name}</div>
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr><th className="p-2 text-left">Column</th><th className="p-2 text-left">Type</th><th className="p-2 text-right">Null %</th><th className="p-2 text-right">Distinct</th></tr>
                  </thead>
                  <tbody>
                    {p.columns.map((c: any) => (
                      <tr key={c.name} className="border-t border-border">
                        <td className="p-2">{c.name}</td>
                        <td className="p-2">{c.type}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{c.null_pct}%</td>
                        <td className="p-2 text-right font-mono tabular-nums">{c.distinct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {profiles.filter((p: any) => p.extracted_text).map((p: any) => (
            <div key={p.name}>
              <div className="text-sm font-medium text-foreground">{p.name} <span className="text-xs text-muted-foreground">({p.page_count} pages)</span></div>
              <p className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">{(p.extracted_text ?? '').slice(0, 800) || 'No extractable text.'}</p>
            </div>
          ))}
          {compatibility.length > 0 && (
            <div>
              <div className="text-sm font-medium text-foreground">Compatibility checks</div>
              <div className="mt-2 space-y-2">
                {compatibility.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 text-xs">
                    <div className="font-medium">{c.pair.join(' vs ')} \u2014 {c.axis}: {c.verdict}</div>
                    {c.reconciliation && <p className="mt-1 text-muted-foreground">{c.reconciliation}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-sm font-medium text-foreground">Decision history</div>
            {resolutions.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No decisions recorded yet.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {resolutions.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{r.action}{r.reason ? ` \u2014 ${r.reason}` : ''}</span>
                    <span>{r.applied_in_version ? `v${r.applied_in_version}` : 'pending'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function VersionHistorySheet({ open, onOpenChange, report, authFetch, isSample }: { open: boolean; onOpenChange: (v: boolean) => void; report: ReportRow; authFetch: AuthFetch; isSample: boolean }) {
  const [versions, setVersions] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || isSample) return
    setLoading(true)
    authFetch('/api/reports').then((r) => r.json()).then((d) => {
      if (d.success) {
        const rootId = report.parent_report_id ?? report.id
        const family = (d.data as ReportRow[]).filter((r) => r.id === rootId || r.parent_report_id === rootId || r.id === report.id)
        setVersions(family.sort((a, b) => a.version - b.version))
      }
    }).finally(() => setLoading(false))
  }, [open, authFetch, report, isSample])

  const list = isSample ? [report] : versions

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Every version is readable and exportable; older ones are read-only.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading\u2026</div>}
          {!loading && list.map((v) => (
            <div key={v.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Version {v.version}</span>
                <span className="font-mono tabular-nums text-muted-foreground">strength {v.evidence_strength}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{v.created_at ? new Date(v.created_at).toLocaleString() : ''}</div>
              {v.change_summary && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {Array.isArray(v.change_summary.claims_added) && v.change_summary.claims_added.length > 0 && <div>+{v.change_summary.claims_added.length} claims added</div>}
                  {Array.isArray(v.change_summary.claims_reworded) && v.change_summary.claims_reworded.length > 0 && <div>{v.change_summary.claims_reworded.length} claims reworded</div>}
                  {Array.isArray(v.change_summary.gaps_closed) && v.change_summary.gaps_closed.length > 0 && <div>{v.change_summary.gaps_closed.length} gaps closed</div>}
                  {v.change_summary.confidence_moved && <div>{v.change_summary.confidence_moved}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
