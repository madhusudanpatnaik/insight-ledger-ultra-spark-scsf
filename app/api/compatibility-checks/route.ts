import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { compatibility_checks } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const report_id = new URL(req.url).searchParams.get('report_id')
    const repo = scopedRepo(compatibility_checks)
    const rows = report_id
      ? await repo.findMany({ where: eq(compatibility_checks.report_id, report_id), orderBy: desc(compatibility_checks.created_at) })
      : await repo.findMany({ orderBy: desc(compatibility_checks.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/compatibility-checks error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(compatibility_checks).insert({
      report_id: body.report_id,
      dataset_a_id: body.dataset_a_id ?? null,
      dataset_b_id: body.dataset_b_id ?? null,
      axis: body.axis,
      verdict: body.verdict,
      proposed_reconciliation: body.proposed_reconciliation ?? null,
      resolved: body.resolved ?? false,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/compatibility-checks error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(compatibility_checks).update(eq(compatibility_checks.id, body.id), {
      resolved: body.resolved,
    })
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/compatibility-checks error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
