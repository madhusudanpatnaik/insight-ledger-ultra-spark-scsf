import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { evidence_gaps } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const report_id = new URL(req.url).searchParams.get('report_id')
    const repo = scopedRepo(evidence_gaps)
    const rows = report_id
      ? await repo.findMany({ where: eq(evidence_gaps.report_id, report_id), orderBy: desc(evidence_gaps.created_at) })
      : await repo.findMany({ orderBy: desc(evidence_gaps.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/evidence-gaps error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(evidence_gaps).insert({
      report_id: body.report_id,
      field_name: body.field_name,
      plain_label: body.plain_label,
      action_phrase: body.action_phrase,
      tier: body.tier ?? 'optional',
      why_it_matters: body.why_it_matters ?? null,
      unlocks_question: body.unlocks_question ?? null,
      explains_figure: body.explains_figure ?? null,
      expected_impact: body.expected_impact ?? 'low',
      conclusions_affected: body.conclusions_affected ?? 0,
      from_template: body.from_template ?? false,
      resolved: body.resolved ?? false,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/evidence-gaps error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(evidence_gaps).update(eq(evidence_gaps.id, body.id), {
      resolved: body.resolved,
    })
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/evidence-gaps error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
