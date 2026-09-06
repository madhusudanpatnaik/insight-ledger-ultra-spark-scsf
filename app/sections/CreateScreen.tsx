'use client'

import React, { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  UploadCloud, FileSpreadsheet, FileText, FileJson, FileType, CheckCircle2,
  AlertTriangle, XCircle, Loader2, ChevronRight, X,
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

  return (
    <div className="mx-auto max-w-[640px] px-6 pb-16 pt-10 sm:pt-12">
      <h1 className="text-[28px] font-semibold tracking-tight text-balance sm:text-[30px]">Create a report</h1>
      <p className="mt-2 text-sm text-muted-foreground">Drop in whatever you have. Messy is fine.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-6 rounded-xl border-[1.5px] border-dashed bg-card px-5 py-10 text-center transition-colors sm:py-12 ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-3 text-lg font-semibold text-foreground">Drop your files here</div>
        <div className="mt-1.5 text-xs text-muted-foreground">Excel \u00b7 CSV \u00b7 PDF \u00b7 Word \u00b7 JSON</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.doc"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Button className="mt-4 min-h-[40px]" variant="outline" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
      </div>

      {profiles.length > 0 && (
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {profiles.map((p) => (
            <div key={p.name} className="flex items-center gap-3 px-4 py-3 text-sm">
              {p.status === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--chart-2,theme(colors.emerald.600))]" />}
              {p.status === 'blocked' && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
              {p.status === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
              <span className="shrink-0 text-muted-foreground">{fileIcon(p.source_type)}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{p.detail}</span>
              <span className="ml-auto shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">data</span>
              <button onClick={() => removeProfile(p.name)} aria-label={`Remove ${p.name}`} className="ml-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {templateProfile && (
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="shrink-0 text-muted-foreground">{fileIcon(templateProfile.source_type)}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{templateProfile.name}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{templateProfile.detail}</span>
              <span className="ml-auto shrink-0 rounded border border-[color:var(--primary)]/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">template</span>
              <button onClick={() => setTemplateProfile(null)} aria-label="Remove template" className="ml-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {blockedFiles.map((p) => (
        <div key={p.name} className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13.5px]">
          <b className="block text-sm text-destructive">I can&apos;t verify {p.name}&apos;s figures against your data yet</b>
          <p className="mt-1 text-muted-foreground">Document figures are kept separate and marked unverified until confirmed \u2014 they won&apos;t anchor a headline finding alone.</p>
        </div>
      ))}

      {compatChecks.map((c, i) => (
        <div key={i} className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-[13.5px] dark:bg-amber-950/20">
          <b className="block text-sm text-amber-700 dark:text-amber-400">Two files measure time differently</b>
          <p className="mt-1 text-muted-foreground">{c.reconciliation}</p>
        </div>
      ))}

      {period && (
        <div className="mt-3 text-[13.5px] text-muted-foreground">
          {period} <button className="text-primary hover:underline" onClick={() => setPeriod('')}>Change</button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <label className="block text-[13.5px] text-muted-foreground" htmlFor="q">What do you want to understand? (optional)</label>
          <Textarea
            id="q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Why did sales decline in Q2?"
            className="mt-2 min-h-[44px] resize-none text-[14.5px]"
          />
        </div>
        <div>
          <label className="block text-[13.5px] text-muted-foreground">Follow a report template (optional)</label>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="truncate text-sm text-foreground">{templateProfile ? templateProfile.name : 'None selected'}</span>
            <label className="shrink-0">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={uploadAsTemplate}
                onChange={(e) => setUploadAsTemplate(e.target.checked)}
              />
              <span className={`inline-flex min-h-[32px] cursor-pointer items-center rounded-md border px-3 text-xs font-medium transition-colors ${uploadAsTemplate ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                {uploadAsTemplate ? 'Next upload = template' : 'Mark next upload as template'}
              </span>
            </label>
          </div>
          {templateProfile && (
            <div className="mt-2 text-xs text-primary">
              Following your structure, using your new numbers. <span className="text-muted-foreground">({templateProfile.detail})</span>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {!generating && (
        <div className="mt-6 flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground sm:mr-auto">Both are optional \u2014 files alone are enough.</p>
          <Button size="lg" disabled={!canGenerate} onClick={handleGenerate} className="min-h-[44px]">
            Generate report <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {generating && (
        <div className="mt-6 max-w-sm rounded-lg border border-border bg-card p-5">
          {TICKS.map((label, i) => (
            <div key={label} className="flex items-center gap-3 py-1.5 text-[14.5px]">
              {ticks[i] === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              {ticks[i] === 'active' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
              {ticks[i] === 'pending' && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted" />}
              <span className={ticks[i] === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {sampleData && profiles.length === 0 && !generating && (
        <p className="mt-8 text-xs text-muted-foreground">
          Turn off Sample Data in the top bar once you have real files to see only your own reports.
        </p>
      )}
    </div>
  )
}
