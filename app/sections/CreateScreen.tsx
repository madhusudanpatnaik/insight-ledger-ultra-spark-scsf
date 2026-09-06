'use client'

import React, { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  UploadCloud, FileSpreadsheet, FileText, FileJson, FileType, CheckCircle2,
  AlertTriangle, XCircle, Loader2, ChevronRight, X, Database,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import {
  AGENT_IDS,
} from '@/app/page'
import {
  parseCSVText, parseXLSXBuffer, parseJSONText, parsePDFBuffer, parseDOCXBuffer,
  profileTabularDataset, profileDocument, checkCompatibility, computeEvidenceStrength,
  normalizeReportJson, type DatasetProfile, type StatsPack, type ReportRow, type AuthFetch,
  type ReportJson, type GapLedgerItem,
} from '@/app/sections/evidenceLib'

export type { DatasetProfile as DatasetInfo, ReportRow, ReportJson }

interface CreateScreenProps {
  authFetch: AuthFetch
  userId: string
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  onReportReady: (r: ReportRow) => void
  sampleData: boolean
}

type TickState = 'pending' | 'active' | 'done'
const TICKS = ['Reading your files', 'Checking data quality', 'Finding patterns', "Checking what's missing", 'Writing the report']

function fileIcon(sourceType: string) {
  switch (sourceType) {
    case 'csv': return <FileSpreadsheet className="h-4 w-4" />
    case 'xlsx': return <FileSpreadsheet className="h-4 w-4" />
    case 'json': return <FileJson className="h-4 w-4" />
    case 'pdf': return <FileText className="h-4 w-4" />
    case 'docx': return <FileType className="h-4 w-4" />
    default: return <FileText className="h-4 w-4" />
  }
}

function extToType(name: string): 'csv' | 'xlsx' | 'json' | 'pdf' | 'docx' | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return 'csv'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'json') return 'json'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  return null
}

export default function CreateScreen({ authFetch, activeAgentId, setActiveAgentId, onReportReady, sampleData }: CreateScreenProps) {
  const [profiles, setProfiles] = useState<DatasetProfile[]>([])
  const [templateProfile, setTemplateProfile] = useState<DatasetProfile | null>(null)
  const [question, setQuestion] = useState('')
  const [period, setPeriod] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [ticks, setTicks] = useState<TickState[]>(TICKS.map(() => 'pending'))
  const [dragOver, setDragOver] = useState(false)
  const [uploadAsTemplate, setUploadAsTemplate] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parseOneFile = useCallback(async (file: File, asTemplate: boolean): Promise<DatasetProfile | null> => {
    const type = extToType(file.name)
    if (!type) {
      toast.error(`${file.name}: unsupported file type`)
      return null
    }
    try {
      if (type === 'csv' || type === 'json') {
        const text = await file.text()
        const rows = type === 'csv' ? parseCSVText(text) : parseJSONText(text)
        if (rows.length === 0) {
          toast.error(`${file.name}: no rows could be read`)
          return null
        }
        return profileTabularDataset(file.name, type, rows, asTemplate ? 'template' : 'source')
      }
      if (type === 'xlsx') {
        const buf = await file.arrayBuffer()
        const rows = await parseXLSXBuffer(buf)
        if (rows.length === 0) {
          toast.error(`${file.name}: no rows could be read`)
          return null
        }
        return profileTabularDataset(file.name, 'xlsx', rows, asTemplate ? 'template' : 'source')
      }
      if (type === 'pdf') {
        const buf = await file.arrayBuffer()
        const { pages, text } = await parsePDFBuffer(buf)
        if (!text.trim()) {
          toast.error(`${file.name}: no extractable text (scanned PDFs are out of scope)`)
          return null
        }
        return profileDocument(file.name, 'pdf', text, pages.length, asTemplate ? 'template' : 'source')
      }
      if (type === 'docx') {
        const buf = await file.arrayBuffer()
        const text = await parseDOCXBuffer(buf)
        if (!text.trim()) {
          toast.error(`${file.name}: no extractable text`)
          return null
        }
        const pageEstimate = Math.max(1, Math.round(text.length / 2200))
        return profileDocument(file.name, 'docx', text, pageEstimate, asTemplate ? 'template' : 'source')
      }
    } catch (err: any) {
      toast.error(`${file.name}: could not be read (${err?.message ?? 'parse error'})`)
      return null
    }
    return null
  }, [])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setErrorMsg(null)
    const list = Array.from(files)
    for (const file of list) {
      const profile = await parseOneFile(file, uploadAsTemplate)
      if (!profile) continue
      if (profile.role === 'template') {
        setTemplateProfile(profile)
        toast.success(`Following ${profile.name} \u2014 using your new numbers`)
      } else {
        setProfiles((prev) => [...prev, profile])
        if (!period && profile.period_start && profile.period_end) {
          setPeriod(`Reading ${profile.period_start} to ${profile.period_end}.`)
        }
      }
    }
  }, [parseOneFile, uploadAsTemplate, period])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeProfile = (name: string) => setProfiles((prev) => prev.filter((p) => p.name !== name))

  const dataProfiles = profiles.filter((p) => p.role === 'source')
  const compatChecks = (() => {
    const checks: ReturnType<typeof checkCompatibility> = []
    const tabular = dataProfiles.filter((p) => p.columns?.length)
    for (let i = 0; i < tabular.length; i++) {
      for (let j = i + 1; j < tabular.length; j++) {
        checks.push(...checkCompatibility(tabular[i], tabular[j]))
      }
    }
    return checks
  })()

  const blockedFiles = dataProfiles.filter((p) => p.status === 'blocked')
  const canGenerate = dataProfiles.length > 0 && !generating

  const runTicksThenCall = async (buildStatsPack: () => StatsPack) => {
    setGenerating(true)
    setErrorMsg(null)
    const advance = (i: number) => setTicks((prev) => prev.map((_, idx) => (idx < i ? 'done' : idx === i ? 'active' : 'pending')))
    advance(0)
    await new Promise((r) => setTimeout(r, 350))
    advance(1)
    await new Promise((r) => setTimeout(r, 350))
    advance(2)

    const statsPack = buildStatsPack()

    setActiveAgentId(AGENT_IDS.coordinator)
    const message = JSON.stringify({
      instruction: 'Generate a full adaptive report from this Stats Pack. Follow the five-question structure (What happened / Why or "Why we can\'t tell yet" / What you should know / What you\'re missing / What to do next). Classify every claim proven, inferred, or unknown with a basis, and give inferred claims a stated alternative. Enforce the compatibility gate before combining any figures. Return strict JSON matching the declared schema only, no prose outside the JSON.',
      question: question.trim() || null,
      template: templateProfile ? { name: templateProfile.name, extracted_text: (templateProfile.extracted_text ?? '').slice(0, 6000) } : null,
      stats_pack: statsPack,
      documents: dataProfiles.filter((p) => p.extracted_text).map((p) => ({ name: p.name, text: (p.extracted_text ?? '').slice(0, 6000), pages: p.page_count })),
    })

    advance(3)
    let result
    try {
      result = await callAIAgent(message, AGENT_IDS.coordinator)
    } catch (err: any) {
      setGenerating(false)
      setActiveAgentId(null)
      setErrorMsg(err?.message ?? 'The report could not be generated. Please try again.')
      return
    }
    advance(4)

    if (!result.success || result.response?.status !== 'success') {
      setGenerating(false)
      setActiveAgentId(null)
      setErrorMsg(result.response?.message ?? 'Request failed \u2014 the report could not be generated.')
      return
    }

    const reportJson = normalizeReportJson(result.response.result)
    if (!reportJson) {
      setGenerating(false)
      setActiveAgentId(null)
      setErrorMsg('The report came back in an unexpected shape and could not be safely rendered. Please try again.')
      return
    }

    const gapLedger: GapLedgerItem[] = Array.isArray(reportJson.gap_ledger) ? reportJson.gap_ledger : []
    const { total, components } = computeEvidenceStrength(statsPack.profiles, gapLedger, statsPack.compatibility)

    await new Promise((r) => setTimeout(r, 200))
    setGenerating(false)
    setActiveAgentId(null)

    try {
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportJson.title || 'Untitled report',
          question: question.trim() || null,
          dataset_ids: dataProfiles.map((p) => p.name),
          stats_pack: statsPack,
          report_json: reportJson,
          evidence_strength: total,
          strength_components: components,
          version: 1,
          status: 'current',
        }),
      })
      const data = await res.json()
      if (data.success) {
        onReportReady(data.data)
        toast.success('Report generated')
      } else {
        setErrorMsg(data.error ?? 'The report was generated but could not be saved.')
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'The report was generated but could not be saved.')
    }
  }

  const handleGenerate = () => {
    if (dataProfiles.length === 0) return
    runTicksThenCall(() => {
      const rowCounts: Record<string, number> = {}
      dataProfiles.forEach((p) => { if (p.row_count) rowCounts[p.name] = p.row_count })
      return {
        period: period || 'Period not detected from the uploaded files.',
        metrics: {},
        row_counts: rowCounts,
        profiles: profiles,
        compatibility: compatChecks,
      }
    })
  }

  const sampleQuestions = [
    'Why did enterprise bookings decline in Q2?',
    'What drove the variance across regional accounts?',
    'Is margin contraction volume-driven or price-driven?',
  ]

  return (
    <div className="mx-auto max-w-3xl px-6 pb-20 pt-8 sm:pt-10">
      {/* Editorial Header */}
      <div className="border-b border-border pb-6">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[11px] font-mono text-primary uppercase">
          <Database className="h-3 w-3" /> Step 1 · Data Ingestion &amp; Profiling
        </div>
        <h1 className="mt-2 font-editorial text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          New Evidence Dossier
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-xl text-pretty">
          Drop in raw operational spreadsheets, JSON feeds, or prior document decks. Evidence calculates every metric deterministically before the agents begin auditing.
        </p>
      </div>

      {/* Modern High-Aesthetic Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative mt-6 overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12 ${
          dragOver
            ? 'border-primary bg-primary/10 ring-4 ring-primary/15'
            : 'border-border bg-card/80 hover:border-primary/40 hover:bg-card'
        }`}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-sm">
          <UploadCloud className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-editorial text-xl font-semibold text-foreground">
          Drag &amp; drop source files here
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Financial sheets, customer logs, prior board PDFs, or word documents
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {['.XLSX', '.CSV', '.JSON', '.PDF', '.DOCX'].map((ext) => (
            <span key={ext} className="rounded-md border border-border bg-muted/30 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {ext}
            </span>
          ))}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.doc"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button className="min-h-[42px] shadow-sm" onClick={() => inputRef.current?.click()}>
            Browse files from device
          </Button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              checked={uploadAsTemplate}
              onChange={(e) => setUploadAsTemplate(e.target.checked)}
            />
            <span>Mark next upload as <strong className="text-foreground">House Template</strong></span>
          </label>
        </div>
      </div>

      {/* Profiles Deck */}
      {profiles.length > 0 && (
        <div className="mt-6 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground uppercase px-1">
            <span>Uploaded Data Sources ({profiles.length})</span>
            <span>Deterministic Parsing</span>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {profiles.map((p) => (
              <div key={p.name} className="flex items-center gap-3.5 px-4 py-3.5 text-sm transition-colors hover:bg-muted/20">
                <span className="shrink-0">
                  {p.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                  {p.status === 'blocked' && <XCircle className="h-4 w-4 text-destructive" />}
                  {p.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                </span>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                  {fileIcon(p.source_type)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{p.name}</span>
                    <span className="rounded border border-border/80 bg-muted/40 px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground uppercase">
                      {p.source_type}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{p.detail}</div>
                </div>

                <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-mono font-medium text-primary uppercase">
                  Data Source
                </span>

                <button
                  onClick={() => removeProfile(p.name)}
                  aria-label={`Remove ${p.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {templateProfile && (
              <div className="flex items-center gap-3.5 px-4 py-3.5 text-sm bg-primary/5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {fileIcon(templateProfile.source_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{templateProfile.name}</span>
                    <span className="rounded border border-primary/30 bg-primary/15 px-2 py-0.2 font-mono text-[10px] font-bold text-primary uppercase">
                      House Format
                    </span>
                  </div>
                  <div className="text-xs text-primary font-mono truncate">Structure &amp; tone detected; numbers are excluded</div>
                </div>
                <button
                  onClick={() => setTemplateProfile(null)}
                  aria-label="Remove template"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blocked Files Guidance */}
      {blockedFiles.map((p) => (
        <div key={p.name} className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>Document Extraction Guardrail: {p.name}</span>
          </div>
          <p className="mt-1 text-muted-foreground leading-relaxed pl-6">
            Figures extracted from this document are marked as unverified provenance facts. They are kept isolated and will never anchor a headline claim unless corroborated by tabular sheets.
          </p>
        </div>
      ))}

      {/* Compatibility Checks Gate */}
      {compatChecks.map((c, i) => (
        <div key={i} className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs dark:bg-amber-950/20">
          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Compatibility Gate: Grain Mismatch Reconciled</span>
          </div>
          <p className="mt-1 text-muted-foreground leading-relaxed pl-6">
            {c.reconciliation}
          </p>
        </div>
      ))}

      {period && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card/60 px-4 py-2.5 text-xs text-muted-foreground">
          <span>{period}</span>
          <button className="text-primary font-medium hover:underline" onClick={() => setPeriod('')}>
            Edit detected period
          </button>
        </div>
      )}

      {/* Question & Template Inputs */}
      <div className="mt-7 grid grid-cols-1 gap-5 border-t border-border pt-6 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-foreground mb-1" htmlFor="q">
            Investigative Target (Optional)
          </label>
          <p className="text-[11px] text-muted-foreground mb-2">Focuses agent synthesis on an executive question.</p>
          <Textarea
            id="q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Why did bookings decline in Q2?"
            className="min-h-[72px] resize-none text-xs bg-card"
          />

          {/* Quick Prompt Chips */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {sampleQuestions.map((sq, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setQuestion(sq)}
                className="rounded-md border border-border/80 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors text-left"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-foreground mb-1">
            House Report Template (Optional)
          </label>
          <p className="text-[11px] text-muted-foreground mb-2">Conforms headings &amp; register to existing formats.</p>
          
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs text-foreground truncate">
                {templateProfile ? templateProfile.name : 'No template attached'}
              </span>
              <Badge variant={templateProfile ? 'default' : 'outline'} className="text-[10px] font-mono">
                {templateProfile ? 'Active' : 'Optional'}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {templateProfile
                ? 'Your headings, section order and narrative style will be honored. Data numbers remain pure.'
                : 'Upload a prior deck or docx to mirror your firm’s exact reporting conventions.'}
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* CTA Button or Generation Progress */}
      {!generating && (
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            {dataProfiles.length === 0 ? 'Upload at least one spreadsheet or data source to start.' : `${dataProfiles.length} data source${dataProfiles.length > 1 ? 's' : ''} staged for audit.`}
          </p>
          <Button
            size="lg"
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="min-h-[46px] px-6 text-sm font-semibold shadow-md shadow-primary/20"
          >
            Generate Dossier <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      )}

      {generating && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-lg shadow-black/5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-semibold text-sm text-foreground">Orchestrating Report Architect</span>
            </div>
            <span className="font-mono text-xs text-primary">Claude Opus 4.6</span>
          </div>

          <div className="mt-4 space-y-3">
            {TICKS.map((label, i) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  {ticks[i] === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  {ticks[i] === 'active' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                  {ticks[i] === 'pending' && <span className="h-2 w-2 rounded-full bg-muted shrink-0 ml-1 mr-1" />}
                  <span className={ticks[i] === 'pending' ? 'text-muted-foreground' : 'font-medium text-foreground'}>
                    {label}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {ticks[i] === 'done' ? 'COMPLETE' : ticks[i] === 'active' ? 'AUDITING' : 'WAITING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sampleData && profiles.length === 0 && !generating && (
        <div className="mt-8 rounded-xl border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
          Exploring? The Sample Data toggle in the header already loads ready-to-inspect dossiers.
        </div>
      )}
    </div>
  )
}

