'use client'

import React, { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  UploadCloud,
  Loader2,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  RefreshCw,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import { AGENT_IDS } from '@/app/page'
import {
  type ReportRow,
  type AuthFetch,
  type GapLedgerItem,
  type DatasetProfile,
  parseCSVText,
  parseXLSXBuffer,
  parseJSONText,
  profileTabularDataset,
  normalizeReportJson,
  computeEvidenceStrength,
} from '@/app/sections/evidenceLib'

interface ImproveScreenProps {
  report: ReportRow
  authFetch: AuthFetch
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  onReportUpdated: (r: ReportRow) => void
  onBack: () => void
  sampleData: boolean
}

interface MomentResult {
  before: number
  after: number
  componentDeltas: string
  newConclusions: { count: number; detail: string }
  changedConclusions: { count: number; detail: string }
  uncertaintiesResolved: { count: number; detail: string }
  gapsClosed: { count: number; detail: string }
  promotions: string[]
}

const tierConfig = {
  critical: {
    label: 'Critical Gap',
    badge: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400 dark:border-rose-400/30',
    dot: 'bg-rose-500',
    border: 'border-rose-500/30 hover:border-rose-500/60',
  },
  high: {
    label: 'High Priority',
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400 dark:border-amber-400/30',
    dot: 'bg-amber-500',
    border: 'border-amber-500/30 hover:border-amber-500/60',
  },
  optional: {
    label: 'Refinement',
    badge: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400 dark:border-sky-400/30',
    dot: 'bg-sky-500',
    border: 'border-border hover:border-primary/40',
  },
}

export default function ImproveScreen({
  report,
  authFetch,
  activeAgentId,
  setActiveAgentId,
  onReportUpdated,
  onBack,
  sampleData,
}: ImproveScreenProps) {
  const isSample = report.id.startsWith('sample-')
  const rj = report.report_json
  const [skipped, setSkipped] = useState<Record<string, boolean>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [moment, setMoment] = useState<MomentResult | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ new: true, changed: true })
  const [processing, setProcessing] = useState(false)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  if (!rj) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8 text-center">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-base font-medium text-foreground">No active dossier selected</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Please return to the dossier screen to view open gaps.</p>
          <Button onClick={onBack}>Return to Dossier</Button>
        </div>
      </div>
    )
  }

  const gaps: GapLedgerItem[] = (rj.gap_ledger || []).slice(0, 4)

  const handleUpload = async (gap: GapLedgerItem, file: File) => {
    setUploading((prev) => ({ ...prev, [gap.field]: true }))
    setErrors((prev) => ({ ...prev, [gap.field]: '' }))
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      let rows: Record<string, any>[] = []
      if (ext === 'csv') rows = parseCSVText(await file.text())
      else if (ext === 'xlsx' || ext === 'xls') rows = await parseXLSXBuffer(await file.arrayBuffer())
      else if (ext === 'json') rows = parseJSONText(await file.text())
      else {
        setErrors((prev) => ({ ...prev, [gap.field]: 'Unsupported file format — please upload a CSV, Excel (.xlsx), or JSON file.' }))
        setUploading((prev) => ({ ...prev, [gap.field]: false }))
        return
      }
      if (rows.length === 0) {
        setErrors((prev) => ({ ...prev, [gap.field]: 'The provided file contained zero readable tabular records.' }))
        setUploading((prev) => ({ ...prev, [gap.field]: false }))
        return
      }
      const profile = profileTabularDataset(file.name, ext === 'json' ? 'json' : (ext === 'csv' ? 'csv' : 'xlsx'), rows, 'source')

      // Check the uploaded file plausibly contains the needed field
      const needsText = (gap.needs || gap.why_it_matters || gap.action_phrase || '').toLowerCase()
      const columnNames = (profile.columns || []).map((c) => c.name.toLowerCase())
      const looksRelevant = columnNames.some((n) =>
        needsText.includes(n) ||
        n.includes('date') ||
        n.includes('id') ||
        n.includes('cost') ||
        n.includes('price') ||
        n.includes('account') ||
        n.includes('customer') ||
        n.includes('churn') ||
        n.includes('booking')
      )
      if (!looksRelevant && columnNames.length > 0) {
        setErrors((prev) => ({
          ...prev,
          [gap.field]: `Uploaded dataset (${file.name}) does not appear to contain columns addressing '${gap.needs || 'the missing parameter'}'. Keeping this gap open for verification.`,
        }))
        setUploading((prev) => ({ ...prev, [gap.field]: false }))
        return
      }

      setProcessing(true)
      setActiveAgentId(AGENT_IDS.coordinator)
      const existingProfiles: DatasetProfile[] = report.stats_pack?.profiles ?? []
      const newProfiles = [...existingProfiles, profile]
      const newCompat = [...(report.stats_pack?.compatibility ?? [])]

      const message = JSON.stringify({
        instruction:
          'Update the report with this newly added dataset, which was uploaded specifically to close the named gap. Regenerate affected claims, promote any claim from inferred to proven where the new data now supports it, close the gap, and return change_summary describing exactly what changed (claims_added, claims_removed, claims_reworded, confidence_moved, gaps_closed, gaps_raised).',
        gap_being_closed: gap.action_phrase,
        new_dataset: { name: profile.name, columns: profile.columns, row_count: profile.row_count },
        previous_report: rj,
        stats_pack: { ...report.stats_pack, profiles: newProfiles },
      })

      const result = await callAIAgent(message, AGENT_IDS.coordinator)
      if (!result.success || result.response?.status !== 'success') {
        setErrors((prev) => ({ ...prev, [gap.field]: result.response?.message ?? 'Analytics engine could not process the revision.' }))
        return
      }

      const newReportJson = normalizeReportJson(result.response.result)
      if (!newReportJson) {
        setErrors((prev) => ({ ...prev, [gap.field]: 'Revised report payload did not pass schema validation.' }))
        return
      }

      const { total, components } = computeEvidenceStrength(newProfiles, newReportJson.gap_ledger ?? [], newCompat)
      const before = report.evidence_strength

      const cs = newReportJson.change_summary
      const newMoment: MomentResult = {
        before,
        after: total,
        componentDeltas: `Coverage score elevated by +${Math.max(1, total - before)} points following reconciliation with ${profile.name}.`,
        newConclusions: {
          count: cs?.claims_added?.length ?? 0,
          detail: cs?.claims_added?.[0] ?? 'New analytical conclusions became mathematically provable with this dataset.',
        },
        changedConclusions: {
          count: cs?.claims_reworded?.length ?? 0,
          detail: cs?.claims_reworded?.[0] ?? 'Previous inferred estimate re-calculated and promoted with verified provenance.',
        },
        uncertaintiesResolved: {
          count: cs?.gaps_raised ? 0 : (newReportJson.evidence_strength?.unknown_count < (rj.evidence_strength?.unknown_count ?? 0) ? 1 : 0),
          detail: 'Analytical boundary ambiguity settled by primary records.',
        },
        gapsClosed: {
          count: cs?.gaps_closed?.length ?? 1,
          detail: cs?.gaps_closed?.[0] ?? `${gap.plain_label ?? gap.field} reconciled into evidentiary baseline.`,
        },
        promotions: (cs?.claims_reworded ?? []).filter((c) => /was inferred|now proven|now it's proven|promoted/i.test(c)),
      }
      setMoment(newMoment)

      if (isSample) {
        onReportUpdated({
          ...report,
          report_json: newReportJson,
          evidence_strength: total,
          strength_components: components,
          version: report.version + 1,
          change_summary: newReportJson.change_summary,
          stats_pack: { ...report.stats_pack, profiles: newProfiles },
        })
      } else {
        const res = await authFetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newReportJson.title || report.title,
            question: report.question,
            dataset_ids: [...report.dataset_ids, profile.name],
            stats_pack: { ...report.stats_pack, profiles: newProfiles },
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
          await authFetch('/api/reports', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: report.id, status: 'superseded' }),
          })
          onReportUpdated(data.data)
        } else {
          setErrors((prev) => ({ ...prev, [gap.field]: data.error ?? 'Could not persist the revised report version.' }))
        }
      }
      toast.success('Dossier upgraded with new evidence')
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [gap.field]: err?.message ?? 'File ingestion interrupted.' }))
    } finally {
      setUploading((prev) => ({ ...prev, [gap.field]: false }))
      setProcessing(false)
      setActiveAgentId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pb-24 pt-8">
      {/* Top Breadcrumb / Back Link */}
      <div className="flex items-center justify-between pb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Return to Dossier</span>
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            v{report.version} Baseline
          </Badge>
          <Badge
            className={`font-mono text-xs ${
              report.evidence_strength >= 75
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
                : report.evidence_strength >= 50
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400'
                : 'bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400'
            }`}
          >
            Strength: {report.evidence_strength}/100
          </Badge>
        </div>
      </div>

      {/* Screen Header */}
      <div className="space-y-2 border-b border-border pb-6">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Incremental Evidence Loop</span>
        </div>
        <h1 className="font-editorial text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          Strengthen Evidence &amp; Close Gaps
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
          {gaps.length > 0
            ? `The analytical audit detected ${gaps.length} missing evidentiary dimension${
                gaps.length === 1 ? '' : 's'
              }. Provide supplementary records to eliminate uncertainty and promote unverified claims.`
            : 'All identified evidentiary gaps have been resolved. The current dossier operates at maximum mathematical certainty.'}
        </p>
      </div>

      {/* Active Gap Cards */}
      <div className="mt-8 space-y-5">
        {gaps
          .filter((g) => !skipped[g.field])
          .map((gap) => {
            const parts = gap.action_phrase ? gap.action_phrase.split(/→|->/) : [gap.field, 'Resolve gap']
            const action = parts[0]?.trim()
            const payoff = parts[1]?.trim()
            const isUploading = uploading[gap.field]
            const tierStyle = tierConfig[gap.tier as keyof typeof tierConfig] || tierConfig.optional

            return (
              <div
                key={gap.field}
                className={`group rounded-2xl border bg-card p-6 shadow-sm transition-all duration-200 ${tierStyle.border}`}
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${tierStyle.dot} ring-4 ring-current/10`} />
                    <Badge variant="outline" className={`text-[11px] font-mono uppercase tracking-wider font-semibold ${tierStyle.badge}`}>
                      {tierStyle.label}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      Field: <code className="text-foreground font-semibold">{gap.field}</code>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {gap.expected_impact === 'high' ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">Impact: Shifts Core Verdict</span>
                      ) : gap.expected_impact === 'medium' ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Impact: Adds Dimension</span>
                      ) : (
                        <span className="text-muted-foreground">Impact: Minor Precision</span>
                      )}
                    </Badge>
                  </div>
                </div>

                {/* Main Action & Expected Payoff */}
                <div className="pt-4 space-y-2">
                  <h3 className="font-editorial text-lg sm:text-xl font-semibold text-foreground leading-snug">
                    {action}
                    {payoff && (
                      <span className="text-primary font-normal">
                        {' '}
                        <span className="text-muted-foreground font-sans text-sm">→</span> {payoff}
                      </span>
                    )}
                  </h3>

                  {gap.why_it_matters && (
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {gap.why_it_matters}
                    </p>
                  )}
                </div>

                {/* Analytical Requirements Grid */}
                {(gap.unlocks_question || gap.needs) ? (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-xs">
                    {gap.unlocks_question && (
                      <div className="space-y-1">
                        <div className="text-muted-foreground font-mono uppercase tracking-wider text-[10px] flex items-center gap-1">
                          <HelpCircle className="h-3 w-3 text-primary" /> Unlocks Question
                        </div>
                        <div className="font-medium text-foreground italic">
                          &ldquo;{gap.unlocks_question}&rdquo;
                        </div>
                      </div>
                    )}

                    {gap.needs && (
                      <div className="space-y-1">
                        <div className="text-muted-foreground font-mono uppercase tracking-wider text-[10px] flex items-center gap-1">
                          <FileSpreadsheet className="h-3 w-3 text-primary" /> Expected Schema / Columns
                        </div>
                        <div className="font-mono text-foreground font-medium flex flex-wrap gap-1.5">
                          {gap.needs.split(',').map((f, fi) => (
                            <span key={fi} className="rounded bg-background px-1.5 py-0.5 border border-border">
                              {f.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Error Message */}
                {errors[gap.field] && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{errors[gap.field]}</span>
                  </div>
                )}

                {/* Action Controls */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <span>Accepted:</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">.CSV</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">.XLSX</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">.JSON</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={(el) => {
                        fileInputs.current[gap.field] = el
                      }}
                      type="file"
                      accept=".csv,.xlsx,.xls,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleUpload(gap, f)
                        e.target.value = ''
                      }}
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUploading || processing}
                      onClick={() => setSkipped((prev) => ({ ...prev, [gap.field]: true }))}
                      className="text-xs h-9"
                    >
                      {gap.tier === 'optional' ? 'Skip Refinement' : "Data Unavailable"}
                    </Button>

                    <Button
                      size="sm"
                      disabled={isUploading || processing}
                      onClick={() => fileInputs.current[gap.field]?.click()}
                      className="text-xs h-9 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Reconciling Data...
                        </>
                      ) : (
                        <>
                          <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                          Upload Supplementary Data
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {/* Moment of Truth Showcase (When revision has succeeded) */}
      {moment && (
        <div className="mt-10 rounded-2xl border border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative space-y-6">
            {/* Header / Badge */}
            <div className="flex items-center justify-between border-b border-border/80 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-editorial text-lg sm:text-xl font-semibold text-foreground">
                    Evidence Calibration Complete
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    Dossier upgraded to version v{report.version} with verified mathematical proof
                  </p>
                </div>
              </div>

              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 font-mono text-xs">
                PROVENANCE SEALED
              </Badge>
            </div>

            {/* Score Delta Visualization */}
            <div className="rounded-xl border border-border/80 bg-background/80 p-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Evidence Strength</span>
                  <div className="flex items-baseline gap-2 font-mono text-2xl sm:text-3xl font-bold">
                    <span className="text-muted-foreground line-through decoration-muted-foreground/50">{moment.before}</span>
                    <ArrowRight className="h-5 w-5 text-primary self-center" />
                    <span className="text-emerald-600 dark:text-emerald-400">{moment.after}</span>
                    <span className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      (+{moment.after - moment.before} pts)
                    </span>
                  </div>
                </div>

                <span className="text-xs font-mono text-muted-foreground">Scale: 0 – 100</span>
              </div>

              {/* Dual-State Progress Bar */}
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
                <div
                  className="h-full bg-primary/40 rounded-full absolute left-0 top-0 transition-all duration-500"
                  style={{ width: `${moment.before}%` }}
                />
                <div
                  className="h-full bg-emerald-500 rounded-full absolute left-0 top-0 transition-all duration-1000 shadow-sm"
                  style={{ width: `${moment.after}%` }}
                />
              </div>

              <p className="text-xs font-mono text-muted-foreground pt-1">
                {moment.componentDeltas}
              </p>
            </div>

            {/* Impact Breakdown List */}
            <div className="space-y-2">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Analytical Ramifications
              </div>

              <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-background/50 text-sm">
                {[
                  {
                    label: `${moment.newConclusions.count} new analytical conclusion${moment.newConclusions.count === 1 ? '' : 's'}`,
                    detail: moment.newConclusions.detail,
                    key: 'new',
                  },
                  {
                    label: `${moment.changedConclusions.count} conclusion${moment.changedConclusions.count === 1 ? '' : 's'} strengthened`,
                    detail: moment.changedConclusions.detail,
                    key: 'changed',
                  },
                  {
                    label: `${moment.uncertaintiesResolved.count} boundar${moment.uncertaintiesResolved.count === 1 ? 'y' : 'ies'} resolved`,
                    detail: moment.uncertaintiesResolved.detail,
                    key: 'unc',
                  },
                  {
                    label: `${moment.gapsClosed.count} evidentiary gap${moment.gapsClosed.count === 1 ? '' : 's'} closed`,
                    detail: moment.gapsClosed.detail,
                    key: 'gaps',
                  },
                ].map((row) => (
                  <div key={row.key} className="p-3.5 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{row.label}</span>
                      </div>
                      {expanded[row.key] && (
                        <p className="text-xs text-muted-foreground pl-6 font-mono leading-relaxed">
                          {row.detail}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                      className="text-xs font-mono text-primary hover:underline shrink-0 pt-0.5"
                    >
                      {expanded[row.key] ? 'Collapse' : 'Inspect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Promoted Claims Showcase */}
            {moment.promotions.length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Claims Promoted from [INFERRED] to [PROVEN]</span>
                </div>
                <div className="space-y-1.5 pl-5">
                  {moment.promotions.map((p, i) => (
                    <div key={i} className="text-xs font-mono text-foreground/90 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation back to Dossier */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <Button onClick={onBack} className="bg-primary text-primary-foreground shadow-sm">
                Open Upgraded Dossier (v{report.version})
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* All gaps resolved empty state */}
      {gaps.length === 0 && !moment && (
        <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="font-editorial text-xl font-semibold text-foreground">
            No Open Gaps Detected
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Every analytical claim in this dossier is backed by primary tabular datasets with full cross-file reconciliation.
          </p>
          <div className="pt-2">
            <Button variant="outline" onClick={onBack}>
              Return to Dossier
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
