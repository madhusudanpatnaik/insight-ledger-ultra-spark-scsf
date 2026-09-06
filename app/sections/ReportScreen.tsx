'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ArrowLeft, Download, Send, MessageSquare, ChevronRight, Loader2, CheckCircle2,
  AlertCircle, History, Mail, MessageCircle as SlackIcon, X, Info, Circle, Sparkles,
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
  if (c === 'proven') return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  if (c === 'inferred') return 'border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-400'
  return 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
}

function ClaimLine({ claim }: { claim: Claim }) {
  const isProven = claim.class === 'proven'
  const isInferred = claim.class === 'inferred'
  const isUnknown = claim.class === 'unknown'
  return (
    <div className="border-b border-border/80 py-3.5 last:border-0 group">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
            {isProven && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            {isInferred && <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
            {isUnknown && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
          </span>
          <span className="text-[15px] font-medium leading-snug text-foreground">
            {claim.text}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold ${classClasses(claim.class)}`}>
          {claim.class}
        </span>
      </div>
      
      {claim.basis && (
        <div className="mt-1.5 pl-6 text-xs font-mono text-muted-foreground">
          Basis: <span className="text-foreground/80">{claim.basis}</span>
        </div>
      )}

      {isInferred && claim.alternative && (
        <div className="mt-2 ml-6 rounded-lg border border-violet-400/30 bg-violet-500/5 p-2.5 text-xs text-muted-foreground">
          <span className="font-editorial italic font-semibold text-foreground">Alternative explanation: </span>
          {claim.alternative}
        </div>
      )}

      {isUnknown && claim.alternative && (
        <div className="mt-2 ml-6 rounded-lg border border-amber-400/30 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
          <span className="font-editorial italic font-semibold text-foreground">What would settle it: </span>
          {claim.alternative}
        </div>
      )}
    </div>
  )
}

function MiniChart({ values, caption }: { values: number[]; caption: string }) {
  if (!Array.isArray(values) || values.length < 2) return null
  const w = 680, h = 180, pad = 36
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)), v }
  })
  const ptsString = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const areaString = `${pad},${h - pad} ${ptsString} ${w - pad},${h - pad}`

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mb-2">
        <span>Weekly Velocity Trend</span>
        <span>Peak: ${max.toLocaleString()} · Trough: ${min.toLocaleString()}</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption} className="overflow-visible">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="currentColor" className="text-border/40" strokeDasharray="4 4" />
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="currentColor" className="text-border/40" strokeDasharray="4 4" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-border/80" />
        <polygon points={areaString} fill="url(#chartGrad)" />
        <polyline points={ptsString} fill="none" stroke="currentColor" strokeWidth={2.8} className="text-primary" />
        <circle cx={pts[0].x} cy={pts[0].y} r={4.5} className="fill-primary stroke-card stroke-2" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4.5} className="fill-primary stroke-card stroke-2" />
      </svg>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-2.5">
        <span className="font-editorial italic text-foreground/90">{caption}</span>
        <span className="font-mono text-[11px]">Stats Pack Verified</span>
      </div>
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
    <div className="w-80 space-y-3 p-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Evidence Strength Index</h4>
        <p className="text-[11px] text-muted-foreground">Computed score on coverage, consistency, and null rates.</p>
      </div>
      <div className="space-y-2">
        {rows.map(([label, val]) => (
          <div key={label} className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{label}</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">{val} / {max[label]}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(val / (max[label] || 1)) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
        Fastest path to raise score: address <b className="text-foreground">{weakest[0].toLowerCase()}</b> via the Improve tab.
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
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const left = 50
      const right = pageW - 50
      const contentW = right - left

      // ---- brand palette (mirrors app/globals.css tokens) ----
      const INK: [number, number, number] = [8, 30, 38]          // foreground
      const MUTED: [number, number, number] = [95, 118, 125]     // muted-foreground
      const TEAL: [number, number, number] = [8, 92, 108]        // primary
      const TEAL_LIGHT: [number, number, number] = [230, 246, 248]
      const CARD_BORDER: [number, number, number] = [214, 227, 229]
      const EMERALD: [number, number, number] = [4, 120, 87]
      const EMERALD_BG: [number, number, number] = [230, 248, 242]
      const VIOLET: [number, number, number] = [109, 40, 217]
      const VIOLET_BG: [number, number, number] = [242, 235, 253]
      const AMBER: [number, number, number] = [180, 108, 8]
      const AMBER_BG: [number, number, number] = [252, 242, 224]
      const RED: [number, number, number] = [190, 40, 40]
      const RED_BG: [number, number, number] = [252, 232, 232]

      let y = 0

      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - 56) {
          doc.addPage()
          y = 56
        }
      }

      const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2])
      const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])
      const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2])

      // ---- header band ----
      setFill(TEAL)
      doc.rect(0, 0, pageW, 118, 'F')
      setText([255, 255, 255])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      const titleLines = doc.splitTextToSize(rj.title || 'Report', contentW)
      doc.text(titleLines, left, 46)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(220, 240, 242)
      doc.text(`${rj.period || ''}`, left, 46 + titleLines.length * 20 + 4)
      doc.setFontSize(9)
      doc.text(`Evidence strength ${report.evidence_strength}/100  \u00b7  Version ${report.version}  \u00b7  ${rj.overall_confidence?.toUpperCase() || ''} confidence`, left, 46 + titleLines.length * 20 + 20)
      y = 140

      // ---- executive summary card ----
      setText(INK)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('EXECUTIVE SUMMARY', left, y)
      y += 12
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11.5)
      const summaryLines = doc.splitTextToSize(rj.executive_summary || '', contentW - 24)
      const summaryBoxH = summaryLines.length * 15 + 24
      setFill(TEAL_LIGHT)
      setDraw(CARD_BORDER)
      doc.roundedRect(left, y, contentW, summaryBoxH, 6, 6, 'FD')
      setText(INK)
      doc.text(summaryLines, left + 12, y + 20)
      y += summaryBoxH + 20

      // ---- claim class chip helper ----
      const classPalette: Record<string, { fg: [number, number, number]; bg: [number, number, number] }> = {
        proven: { fg: EMERALD, bg: EMERALD_BG },
        inferred: { fg: VIOLET, bg: VIOLET_BG },
        unknown: { fg: AMBER, bg: AMBER_BG },
      }

      const drawChip = (label: string, x: number, yy: number, palette: { fg: [number, number, number]; bg: [number, number, number] }) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        const w = doc.getTextWidth(label.toUpperCase()) + 14
        setFill(palette.bg)
        doc.roundedRect(x, yy - 9, w, 13, 6, 6, 'F')
        setText(palette.fg)
        doc.text(label.toUpperCase(), x + 7, yy)
        doc.setFont('helvetica', 'normal')
        return w
      }

      // ---- sections ----
      for (const section of rj.sections || []) {
        ensureSpace(40)
        setDraw(CARD_BORDER)
        doc.setLineWidth(1)
        doc.line(left, y, right, y)
        y += 18
        setText(TEAL)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.text(section.heading, left, y)
        y += 6
        if (section.status === 'cannot_support') {
          const w = drawChip('cannot support', right - 90, y - 3, { fg: AMBER, bg: AMBER_BG })
        }
        y += 12
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10.5)
        setText([50, 65, 70])
        const bodyText = section.narrative || section.body || ''
        if (bodyText) {
          ensureSpace(24)
          const lines = doc.splitTextToSize(bodyText, contentW)
          doc.text(lines, left, y)
          y += lines.length * 13.5 + 8
        }
        for (const claim of section.claims || []) {
          ensureSpace(30)
          const palette = classPalette[claim.class] || classPalette.unknown
          const lines = doc.splitTextToSize(claim.text, contentW - 20)
          setText(INK)
          doc.setFontSize(10)
          doc.text(lines, left + 14, y)
          const chipY = y - 8
          drawChip(claim.class, right - 70, chipY, palette)
          y += lines.length * 13 + 4
          if (claim.basis) {
            setText(MUTED)
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(8.5)
            doc.text(`Basis: ${claim.basis}`, left + 14, y)
            doc.setFont('helvetica', 'normal')
            y += 12
          }
          y += 4
        }
        y += 10
      }

      // ---- cannot prove callout ----
      if (rj.cannot_prove) {
        ensureSpace(60)
        const lines = doc.splitTextToSize(rj.cannot_prove, contentW - 24)
        const boxH = lines.length * 13 + 30
        setFill(AMBER_BG)
        setDraw([230, 200, 150])
        doc.roundedRect(left, y, contentW, boxH, 6, 6, 'FD')
        setText(AMBER)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text("WHAT THIS REPORT CANNOT PROVE", left + 12, y + 16)
        doc.setFont('helvetica', 'normal')
        setText([80, 60, 20])
        doc.setFontSize(10)
        doc.text(lines, left + 12, y + 30)
        y += boxH + 20
      }

      // ---- gap ledger ----
      if ((rj.gap_ledger || []).length) {
        ensureSpace(30)
        setText(TEAL)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.text("What you're missing", left, y)
        y += 16
        for (const gap of rj.gap_ledger || []) {
          ensureSpace(26)
          const tierColor: [number, number, number] = gap.tier === 'critical' ? RED : gap.tier === 'high' ? AMBER : MUTED
          setFill(tierColor)
          doc.circle(left + 4, y - 3, 3, 'F')
          setText(INK)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          const lines = doc.splitTextToSize(gap.action_phrase, contentW - 60)
          doc.text(lines, left + 14, y)
          const chipPalette = gap.tier === 'critical' ? { fg: RED, bg: RED_BG } : gap.tier === 'high' ? { fg: AMBER, bg: AMBER_BG } : { fg: MUTED, bg: [240, 243, 244] as [number, number, number] }
          drawChip(gap.tier, right - 60, y - 8, chipPalette)
          y += lines.length * 13 + 8
        }
        y += 10
      }

      // ---- footer on every page ----
      const pageCount = doc.getNumberOfPages()
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        setDraw(CARD_BORDER)
        doc.setLineWidth(0.75)
        doc.line(left, pageH - 34, right, pageH - 34)
        setText(MUTED)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text('Generated by Evidence \u2014 your data, explained honestly.', left, pageH - 20)
        doc.text(`Page ${p} of ${pageCount}`, right, pageH - 20, { align: 'right' })
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

  const gapDot = (tier: string) => (tier === 'critical' ? 'bg-destructive ring-4 ring-destructive/20' : tier === 'high' ? 'bg-amber-500 ring-4 ring-amber-500/20' : 'bg-muted-foreground ring-4 ring-muted/20')

  const score = report.evidence_strength || 0
  const scoreBadgeColor = score >= 70
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : score >= 50
    ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30'
    : 'text-destructive bg-destructive/10 border-destructive/30'

  return (
    <div className="min-h-screen pb-24">
      {/* Executive Header Ribbon */}
      <div className="border-b border-border bg-card/90 px-4 pb-6 pt-6 sm:px-8 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <button
              onClick={onBack}
              className="group mb-2.5 inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to reports
            </button>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[10px] font-mono tracking-wider">
                v{report.version}.0 {report.status === 'current' ? 'CURRENT' : report.status.toUpperCase()}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {rj.period}
              </span>
              {isSample && (
                <Badge variant="secondary" className="text-[10px] font-mono text-primary">
                  Demo Sample
                </Badge>
              )}
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl font-semibold tracking-tight text-foreground text-balance">
              {rj.title}
            </h1>

            {report.question && (
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground italic">
                &ldquo;{report.question}&rdquo;
              </p>
            )}

            {/* Evidence Strength Meter Pill */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-1.5">
                <span className="text-xs font-mono text-muted-foreground uppercase">Evidence Strength:</span>
                <span className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${scoreBadgeColor}`}>
                  {score} / 100
                </span>
                <span className="text-xs font-medium text-foreground">
                  {score >= 70 ? 'High Confidence' : score >= 50 ? 'Moderate Confidence' : 'Low Confidence'}
                </span>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" /> How is this audited?
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-84 p-0 border-border bg-card shadow-xl">
                  <StrengthBreakdown report={report} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setShowEvidence((v) => !v)}
              className={`flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-all ${
                showEvidence
                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Switch checked={showEvidence} onCheckedChange={setShowEvidence} className="pointer-events-none scale-75" />
              <span>Audit Evidence</span>
            </button>

            <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf} className="min-h-[40px] rounded-xl text-xs">
              {downloadingPdf ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              PDF
            </Button>

            <Button variant="outline" onClick={() => setShareOpen(true)} className="min-h-[40px] rounded-xl text-xs">
              <Send className="mr-1.5 h-3.5 w-3.5" /> Send
            </Button>

            <Button onClick={() => setQaOpen(true)} className="min-h-[40px] rounded-xl text-xs shadow-sm">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Ask question
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-8 space-y-10">
        {/* Adjudicated Decision Banner */}
        {pendingCount > 0 && (
          <div className="sticky top-16 z-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-primary/40 bg-sidebar p-4 text-sidebar-foreground shadow-lg shadow-black/10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold font-mono text-sm">
                {pendingCount}
              </div>
              <div>
                <div className="font-semibold text-sm text-white">
                  {pendingCount} decision{pendingCount === 1 ? '' : 's'} recorded &amp; pending application
                </div>
                <div className="text-xs text-sidebar-foreground/70">
                  The Report Coordinator will rebuild the analysis once with all binding constraints.
                </div>
              </div>
            </div>
            <Button
              onClick={handleUpdateReport}
              disabled={updating}
              className="min-h-[40px] w-full sm:w-auto bg-accent text-accent-foreground font-semibold hover:opacity-95 shadow-md"
            >
              {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rebuild Dossier to v{report.version + 1}
            </Button>
          </div>
        )}

        {/* Executive Summary */}
        <section className="space-y-4">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Executive Synthesis</span>
          </div>
          <p className="font-editorial text-2xl sm:text-[26px] font-normal leading-relaxed text-foreground max-w-3xl text-balance">
            {rj.executive_summary}
          </p>

          {/* What the data cannot prove */}
          {rj.cannot_prove && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 sm:p-5 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase text-amber-700 dark:text-amber-400 mb-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Audit Boundary · What the Data Cannot Prove</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed pl-6">
                {rj.cannot_prove}
              </p>
            </div>
          )}
        </section>

        {/* Reconciliation cards for pending compatibility */}
        {pendingCompatIdx.map(({ c, i }) => (
          <div key={i} className="rounded-xl border border-border border-l-4 border-l-accent bg-card p-5 shadow-sm">
            <b className="block text-sm font-semibold text-foreground">
              {c.verdict === 'incompatible'
                ? `Cross-File Gate: Cannot merge ${c.pair[0]} and ${c.pair[1]}`
                : `Cross-File Gate: ${c.pair[0]} and ${c.pair[1]} measure time differently`}
            </b>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{c.reconciliation}</p>
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              {c.verdict !== 'incompatible' && (
                <Button size="sm" onClick={() => acceptRecommendation(`compat-${i}`, c.reconciliation ?? '')}>
                  Accept Rolled-Up Figure
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setSourceOpen(true)}>
                Inspect Sources
              </Button>
            </div>
          </div>
        ))}

        {/* Section 1: What happened */}
        {whatHappened && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-foreground">
                1. {whatHappened.heading}
              </h2>
              <span className="text-xs font-mono text-muted-foreground uppercase">Deterministic Narrative</span>
            </div>
            {whatHappened.narrative && (
              <p className="text-sm sm:text-[15px] leading-relaxed text-foreground/90 max-w-3xl">
                {whatHappened.narrative}
              </p>
            )}
            {whatHappened.chart_spec ? (
              (() => {
                const key = whatHappened.chart_spec.stats_pack_keys?.[0]
                const values = key ? getByPath(report.stats_pack, key) : null
                return Array.isArray(values) && values.length > 1 ? (
                  <MiniChart values={values} caption={whatHappened.chart_spec.caption} />
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-3 text-xs italic text-muted-foreground">
                    No visualization needed here — numbers are fully cited in the text.
                  </div>
                )
              })()
            ) : null}
          </section>
        )}

        {/* Section 2: Why we can't tell yet / Why */}
        {whySection && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-foreground">
                2. {whySection.heading}
              </h2>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400 uppercase">
                {whySection.status === 'cannot_support' ? 'Unfilled Section' : 'Analytical Reasoning'}
              </span>
            </div>

            {whySection.status === 'cannot_support' ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 sm:p-5 dark:bg-amber-950/15">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Honest Restraint · Section Left Open</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90 pl-6">
                  {whySection.narrative}
                </p>
                {whySection.body && (
                  <div className="mt-3 pl-6 text-xs font-mono font-medium text-primary">
                    &rarr; {whySection.body}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm sm:text-[15px] leading-relaxed text-foreground/90 max-w-3xl">
                {whySection.narrative}
              </p>
            )}
          </section>
        )}

        {/* Other Sections if any */}
        {otherSections.map((s, idx) => (
          <section key={idx} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-foreground">
                {s.heading}
              </h2>
              <span className="text-xs font-mono text-muted-foreground uppercase">{s.status}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">{s.narrative}</p>
          </section>
        ))}

        {/* Section 3: What you should know */}
        {knowSection && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-foreground">
                3. {knowSection.heading}
              </h2>
              <span className="text-xs font-mono text-muted-foreground uppercase">Strict Claim Auditing</span>
            </div>

            {knowSection.claims.length === 0 ? (
              <p className="text-xs text-muted-foreground">No explicit claims isolated in this section.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {knowSection.claims.map((c) => (
                  <ClaimLine key={c.id} claim={c} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Section 4: What you're missing (THE HERO IMPROVEMENT LEVER) */}
        {missingSection && (
          <section className="rounded-2xl border-2 border-accent/40 bg-card p-6 sm:p-7 shadow-md shadow-accent/5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-border pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-accent uppercase mb-1">
                  Core Product Identity
                </div>
                <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-foreground">
                  4. What You&apos;re Missing
                </h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {rj.gap_ledger?.length || 0} Gaps Tracked
              </span>
            </div>

            <div className="space-y-3.5">
              {(rj.gap_ledger || []).slice(0, 3).map((gap, i) => {
                const parts = gap.action_phrase ? gap.action_phrase.split(/→|->/) : [gap.field, 'Resolve gap']
                const action = parts[0]
                const payoff = parts[1]
                const isCritical = gap.tier === 'critical'
                const isHigh = gap.tier === 'high'
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-border/80 bg-muted/20 p-5 transition-all hover:bg-muted/40 hover:border-primary/40 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${gapDot(gap.tier)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge
                            variant={isCritical ? 'destructive' : 'outline'}
                            className="text-[10px] font-mono uppercase tracking-wider"
                          >
                            {gap.tier} TIER
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            Affects {gap.conclusions_affected} conclusion{gap.conclusions_affected === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="text-base font-semibold text-foreground">
                          {action?.trim()} <span className="text-primary font-bold">&rarr;</span> {payoff?.trim()}
                        </div>

                        {gap.why_it_matters && (
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                            {gap.why_it_matters}
                          </p>
                        )}

                        {gap.unlocks_question && (
                          <div className="mt-2 text-xs font-medium text-primary">
                            Would answer: &ldquo;{gap.unlocks_question}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-border/80 pt-4">
              <p className="text-xs text-muted-foreground">
                Upload supplementary datasets to immediately close gaps and elevate score.
              </p>
              <Button
                size="lg"
                onClick={onImprove}
                className="min-h-[44px] px-6 text-sm font-semibold bg-accent text-accent-foreground shadow-md shadow-accent/20 hover:opacity-95"
              >
                <Sparkles className="mr-2 h-4 w-4" /> Improve Report Now
              </Button>
            </div>
          </section>
        )}

        {/* Section 5: What to do next */}
        {nextSection && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-foreground">
                5. {nextSection.heading}
              </h2>
              <span className="text-xs font-mono text-muted-foreground uppercase">Operational Roadmap</span>
            </div>

            <div className="space-y-3 pt-1">
              {(nextSection.narrative ? nextSection.narrative.split(/\n+/).filter(Boolean) : []).map((line, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-mono font-bold text-xs">
                    {i + 1}
                  </span>
                  <span className="text-foreground/90 pt-0.5 leading-relaxed">
                    {line.replace(/^\d+[\.\)]\s*/, '')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Show Evidence Deep Inspector */}
        {showEvidence && (
          <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-card p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-semibold text-sm text-foreground">Underlying Evidence Ledger</h3>
                <p className="text-xs text-muted-foreground">Every claim, mathematical basis, and cross-file reconciliation.</p>
              </div>
              <Badge variant="outline" className="font-mono text-xs text-primary">
                PROVENANCE ACTIVE
              </Badge>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {rj.sections.flatMap((s) => s.claims).map((c) => (
                <div key={c.id} className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-foreground">{c.text}</span>
                    <Badge variant="secondary" className="text-[10px] font-mono uppercase">{c.class}</Badge>
                  </div>
                  <div className="text-muted-foreground font-mono">Basis: {c.basis}</div>
                </div>
              ))}

              {compatibility.map((c, i) => (
                <div key={i} className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                  <div className="font-semibold text-foreground">Compatibility: {c.pair.join(' vs ')} ({c.axis})</div>
                  <div className="text-muted-foreground">{c.verdict} {c.reconciliation ? `· ${c.reconciliation}` : ''}</div>
                </div>
              ))}

              {!isSample && resolutions.filter((r) => r.applied_in_version != null).map((r) => (
                <div key={r.id} className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                  <div className="font-semibold text-foreground">Settled Resolution: {r.action}</div>
                  <div className="text-muted-foreground font-mono">Applied in version {r.applied_in_version}</div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="mr-1.5 h-3.5 w-3.5" /> Full Version History
              </Button>
            </div>
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
