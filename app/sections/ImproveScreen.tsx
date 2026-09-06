'use client'

import React, { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, UploadCloud, Loader2, ChevronRight, Sparkles, Check,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import { AGENT_IDS } from '@/app/page'
import {
  type ReportRow, type AuthFetch, type GapLedgerItem, type DatasetProfile,
  parseCSVText, parseXLSXBuffer, parseJSONText, profileTabularDataset,
  normalizeReportJson, computeEvidenceStrength, checkCompatibility,
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

const gapDot = (tier: string) => (tier === 'critical' ? 'bg-destructive' : tier === 'high' ? 'bg-amber-500' : 'bg-muted-foreground')

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

export default function ImproveScreen({ report, authFetch, activeAgentId, setActiveAgentId, onReportUpdated, onBack, sampleData }: ImproveScreenProps) {
  const isSample = report.id.startsWith('sample-')
  const rj = report.report_json
  const [skipped, setSkipped] = useState<Record<string, boolean>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [moment, setMoment] = useState<MomentResult | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [processing, setProcessing] = useState(false)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  if (!rj) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-muted-foreground">No report is open.</p>
          <Button className="mt-4" onClick={onBack}>Back</Button>
        </div>
      </div>
    )
  }

  const gaps: GapLedgerItem[] = (rj.gap_ledger || []).slice(0, 3)

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
        setErrors((prev) => ({ ...prev, [gap.field]: 'Unsupported file type \u2014 use CSV, Excel or JSON.' }))
        setUploading((prev) => ({ ...prev, [gap.field]: false }))
        return
      }
      if (rows.length === 0) {
        setErrors((prev) => ({ ...prev, [gap.field]: 'No rows could be read from this file.' }))
        setUploading((prev) => ({ ...prev, [gap.field]: false }))
        return
      }
      const profile = profileTabularDataset(file.name, ext === 'json' ? 'json' : (ext === 'csv' ? 'csv' : 'xlsx'), rows, 'source')

      // Check the uploaded file plausibly contains the needed field.
      const needsText = (gap.needs || gap.why_it_matters || gap.action_phrase || '').toLowerCase()
      const columnNames = (profile.columns || []).map((c) => c.name.toLowerCase())
      const looksRelevant = columnNames.some((n) =>
        needsText.includes(n) || n.includes('date') || n.includes('id') || n.includes('cost') || n.includes('price') || n.includes('account') || n.includes('customer')
      )
      if (!looksRelevant && columnNames.length > 0) {
        setErrors((prev) => ({ ...prev, [gap.field]: `This file doesn't look like it has the field I was looking for (${gap.needs || 'the needed column'}). Keeping this item open.` }))
        setUploading((prev) => ({ ...prev, [gap.field]: false }))
        return
      }

      setProcessing(true)
      setActiveAgentId(AGENT_IDS.coordinator)
      const existingProfiles: DatasetProfile[] = report.stats_pack?.profiles ?? []
      const newProfiles = [...existingProfiles, profile]
      const newCompat = [...(report.stats_pack?.compatibility ?? [])]

      const message = JSON.stringify({
        instruction: 'Update the report with this newly added dataset, which was uploaded specifically to close the named gap. Regenerate affected claims, promote any claim from inferred to proven where the new data now supports it, close the gap, and return change_summary describing exactly what changed (claims_added, claims_removed, claims_reworded, confidence_moved, gaps_closed, gaps_raised).',
        gap_being_closed: gap.action_phrase,
        new_dataset: { name: profile.name, columns: profile.columns, row_count: profile.row_count },
        previous_report: rj,
        stats_pack: { ...report.stats_pack, profiles: newProfiles },
      })
      const result = await callAIAgent(message, AGENT_IDS.coordinator)
      if (!result.success || result.response?.status !== 'success') {
        setErrors((prev) => ({ ...prev, [gap.field]: result.response?.message ?? 'Could not update the report with this file.' }))
        return
      }
      const newReportJson = normalizeReportJson(result.response.result)
      if (!newReportJson) {
        setErrors((prev) => ({ ...prev, [gap.field]: 'The updated report came back in an unexpected shape.' }))
        return
      }
      const { total, components } = computeEvidenceStrength(newProfiles, newReportJson.gap_ledger ?? [], newCompat)
      const before = report.evidence_strength

      const cs = newReportJson.change_summary
      const newMoment: MomentResult = {
        before,
        after: total,
        componentDeltas: `Evidence coverage and source consistency moved after ${profile.name}.`,
        newConclusions: { count: cs?.claims_added?.length ?? 0, detail: cs?.claims_added?.[0] ?? 'New conclusions became possible with this data.' },
        changedConclusions: { count: cs?.claims_reworded?.length ?? 0, detail: cs?.claims_reworded?.[0] ?? 'A previous reading was strengthened.' },
        uncertaintiesResolved: { count: cs?.gaps_raised ? 0 : (newReportJson.evidence_strength?.unknown_count < (rj.evidence_strength?.unknown_count ?? 0) ? 1 : 0), detail: 'An open question is now answered.' },
        gapsClosed: { count: cs?.gaps_closed?.length ?? 1, detail: cs?.gaps_closed?.[0] ?? `${gap.plain_label ?? gap.field} is no longer missing.` },
        promotions: (cs?.claims_reworded ?? []).filter((c) => /was inferred|now proven|now it's proven/i.test(c)),
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
          await authFetch('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: report.id, status: 'superseded' }) })
          onReportUpdated(data.data)
        } else {
          setErrors((prev) => ({ ...prev, [gap.field]: data.error ?? 'Could not save the updated report.' }))
        }
      }
      toast.success('Report improved')
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [gap.field]: err?.message ?? 'Something went wrong reading this file.' }))
    } finally {
      setUploading((prev) => ({ ...prev, [gap.field]: false }))
      setProcessing(false)
      setActiveAgentId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-20 pt-8 sm:pt-9">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to report
      </button>
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[26px]">Improve your report</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {gaps.length > 0 ? `I found ${gaps.length} thing${gaps.length === 1 ? '' : 's'} that would make this analysis stronger.` : 'Nothing further is missing right now.'}
      </p>

      {gaps.filter((g) => !skipped[g.field]).map((gap) => {
        const [action, payoff] = gap.action_phrase.split('\u2192')
        const isUploading = uploading[gap.field]
        return (
          <div key={gap.field} className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${gapDot(gap.tier)}`} />
              <div className="max-w-[58ch] text-base font-semibold sm:text-[16.5px]">
                {action?.trim()} <span className="text-destructive">\u2192</span> {payoff?.trim()}
              </div>
            </div>
            {gap.why_it_matters && <p className="mt-2.5 max-w-[58ch] pl-[23px] text-sm text-muted-foreground">{gap.why_it_matters}</p>}
            {gap.unlocks_question && (
              <div className="mt-2 max-w-[58ch] pl-[23px] text-sm">
                Would answer: <span className="text-primary">{gap.unlocks_question}</span>
              </div>
            )}
            {gap.needs && <div className="mt-2 pl-[23px] text-xs text-muted-foreground">Needs: {gap.needs}</div>}
            <div className="mt-1 pl-[23px] text-xs text-muted-foreground">
              Expected impact: <span className="font-medium text-foreground">{gap.expected_impact === 'high' ? `High \u2014 could change ${gap.conclusions_affected} conclusion${gap.conclusions_affected === 1 ? '' : 's'}` : gap.expected_impact === 'medium' ? `Medium \u2014 adds ${gap.conclusions_affected} conclusion${gap.conclusions_affected === 1 ? '' : 's'}` : 'Low \u2014 adds detail, changes nothing'}</span>
            </div>
            {errors[gap.field] && <div className="mt-2.5 pl-[23px] text-sm text-destructive">{errors[gap.field]}</div>}
            <div className="mt-3.5 flex flex-wrap gap-2.5 pl-[23px]">
              <input
                ref={(el) => { fileInputs.current[gap.field] = el }}
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(gap, f); e.target.value = '' }}
              />
              <Button size="sm" disabled={isUploading || processing} onClick={() => fileInputs.current[gap.field]?.click()} className="min-h-[40px]">
                {isUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1.5 h-4 w-4" />}
                Upload data
              </Button>
              <Button size="sm" variant="outline" disabled={isUploading || processing} onClick={() => setSkipped((prev) => ({ ...prev, [gap.field]: true }))} className="min-h-[40px]">
                {gap.tier === 'optional' ? 'Skip' : "I don't have this"}
              </Button>
            </div>
          </div>
        )
      })}

      {moment && (
        <div className="mt-8 rounded-xl bg-[var(--sidebar,#0A1A20)] p-6 text-[#DCE8EA] sm:p-7">
          <div className="flex flex-wrap items-center gap-4 text-2xl font-semibold tabular-nums text-white sm:text-[26px]">
            <span>Evidence strength {moment.before}</span>
            <span className="h-2 w-[190px] overflow-hidden rounded-full bg-[#254048]">
              <span className="block h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${moment.after}%` }} />
            </span>
            <span>{moment.after}</span>
          </div>
          <div className="mt-2.5 text-[13.5px] text-[#8FB2B9]">{moment.componentDeltas}</div>

          <ul className="mt-4 list-none">
            {[
              { label: `${moment.newConclusions.count} new conclusion${moment.newConclusions.count === 1 ? '' : 's'}`, detail: moment.newConclusions.detail, key: 'new' },
              { label: `${moment.changedConclusions.count} conclusion${moment.changedConclusions.count === 1 ? '' : 's'} changed`, detail: moment.changedConclusions.detail, key: 'changed' },
              { label: `${moment.uncertaintiesResolved.count} uncertaint${moment.uncertaintiesResolved.count === 1 ? 'y' : 'ies'} resolved`, detail: moment.uncertaintiesResolved.detail, key: 'unc' },
              { label: `${moment.gapsClosed.count} gap${moment.gapsClosed.count === 1 ? '' : 's'} closed`, detail: moment.gapsClosed.detail, key: 'gaps' },
            ].map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-4 border-b border-[#23414A] py-3 text-[15px] last:border-0">
                <div>
                  <div>{row.label}</div>
                  {expanded[row.key] && <em className="mt-1 block text-[13px] not-italic text-[#8FB2B9]">{row.detail}</em>}
                </div>
                <button onClick={() => setExpanded((prev) => ({ ...prev, [row.key]: !prev[row.key] }))} className="shrink-0 whitespace-nowrap text-[13.5px] text-accent hover:underline">
                  {expanded[row.key] ? 'Hide' : 'Read'}
                </button>
              </li>
            ))}
          </ul>

          {moment.promotions.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-[#23414A] pt-4">
              {moment.promotions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[13.5px] text-accent">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" /> {p}
                </div>
              ))}
            </div>
          )}

          <div className="mt-5">
            <Button variant="outline" className="border-[#23414A] bg-transparent text-[#DCE8EA] hover:bg-white/5" onClick={onBack}>
              Back to report
            </Button>
          </div>
        </div>
      )}

      {gaps.length === 0 && !moment && (
        <div className="mt-8 flex items-center gap-2 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-600" /> Every tracked gap for this report has been addressed.
        </div>
      )}
    </div>
  )
}
