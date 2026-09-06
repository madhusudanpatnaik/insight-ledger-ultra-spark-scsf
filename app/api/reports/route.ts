import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { reports } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const id = new URL(req.url).searchParams.get('id')
    const repo = scopedRepo(reports)
    if (id) {
      const row = await repo.findOne(eq(reports.id, id))
      return NextResponse.json({ success: true, data: row ?? null })
    }
    const rows = await repo.findMany({ orderBy: desc(reports.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/reports error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(reports).insert({
      title: body.title,
      question: body.question ?? null,
      template_id: body.template_id ?? null,
      dataset_ids: body.dataset_ids ?? [],
      stats_pack: body.stats_pack ?? null,
      report_json: body.report_json ?? null,
      evidence_strength: body.evidence_strength ?? 0,
      strength_components: body.strength_components ?? null,
      version: body.version ?? 1,
      parent_report_id: body.parent_report_id ?? null,
      change_summary: body.change_summary ?? null,
      status: body.status ?? 'draft',
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/reports error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    const [row] = await scopedRepo(reports).update(eq(reports.id, id), updates)
    if (!row) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/reports error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
