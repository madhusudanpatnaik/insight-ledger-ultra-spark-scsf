import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { report_templates } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async () => {
  try {
    const rows = await scopedRepo(report_templates).findMany({ orderBy: desc(report_templates.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/report-templates error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(report_templates).insert({
      name: body.name,
      source_file: body.source_file ?? '',
      structure_json: body.structure_json ?? null,
      expected_metrics: body.expected_metrics ?? null,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/report-templates error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(report_templates).update(eq(report_templates.id, body.id), {
      times_used: body.times_used,
    })
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/report-templates error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
