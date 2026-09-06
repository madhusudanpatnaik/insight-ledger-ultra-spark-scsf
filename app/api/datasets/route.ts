import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { datasets } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const role = new URL(req.url).searchParams.get('role')
    const repo = scopedRepo(datasets)
    const rows = role
      ? await repo.findMany({ where: eq(datasets.role, role), orderBy: desc(datasets.created_at) })
      : await repo.findMany({ orderBy: desc(datasets.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/datasets error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(datasets).insert({
      name: body.name,
      source_type: body.source_type,
      role: body.role ?? 'source',
      row_count: body.row_count ?? null,
      column_count: body.column_count ?? null,
      page_count: body.page_count ?? null,
      grain: body.grain ?? null,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
      units: body.units ?? null,
      profile_json: body.profile_json ?? null,
      extracted_text: body.extracted_text ?? null,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/datasets error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
