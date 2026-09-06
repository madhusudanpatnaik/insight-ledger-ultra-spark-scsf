import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { extracted_facts } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const dataset_id = new URL(req.url).searchParams.get('dataset_id')
    const repo = scopedRepo(extracted_facts)
    const rows = dataset_id
      ? await repo.findMany({ where: eq(extracted_facts.dataset_id, dataset_id), orderBy: desc(extracted_facts.created_at) })
      : await repo.findMany({ orderBy: desc(extracted_facts.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/extracted-facts error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(extracted_facts).insert({
      dataset_id: body.dataset_id,
      label: body.label,
      value_text: body.value_text,
      period: body.period ?? null,
      page_number: body.page_number ?? null,
      verified: body.verified ?? false,
      conflicts_with: body.conflicts_with ?? null,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/extracted-facts error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(extracted_facts).update(eq(extracted_facts.id, body.id), {
      verified: body.verified,
    })
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/extracted-facts error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
