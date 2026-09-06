import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { resolutions } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const report_id = new URL(req.url).searchParams.get('report_id')
    const repo = scopedRepo(resolutions)
    const rows = report_id
      ? await repo.findMany({ where: eq(resolutions.report_id, report_id), orderBy: desc(resolutions.created_at) })
      : await repo.findMany({ orderBy: desc(resolutions.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/resolutions error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(resolutions).insert({
      report_id: body.report_id,
      target_type: body.target_type,
      target_id: body.target_id ?? null,
      action: body.action,
      chosen_value: body.chosen_value ?? null,
      reason: body.reason ?? null,
      basis: body.basis ?? null,
      decided_by: body.decided_by ?? null,
      applied_in_version: body.applied_in_version ?? null,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/resolutions error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const [row] = await scopedRepo(resolutions).update(eq(resolutions.id, id), updates)
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/resolutions error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
