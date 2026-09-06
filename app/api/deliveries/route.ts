import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { deliveries } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const report_id = new URL(req.url).searchParams.get('report_id')
    const repo = scopedRepo(deliveries)
    const rows = report_id
      ? await repo.findMany({ where: eq(deliveries.report_id, report_id), orderBy: desc(deliveries.created_at) })
      : await repo.findMany({ orderBy: desc(deliveries.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/deliveries error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(deliveries).insert({
      report_id: body.report_id,
      report_version: body.report_version ?? 1,
      channel: body.channel,
      recipients: body.recipients ?? [],
      message_body: body.message_body ?? '',
      sent_by: body.sent_by ?? null,
      status: body.status ?? 'draft',
      error_detail: body.error_detail ?? null,
      sent_at: body.sent_at ?? null,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/deliveries error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const PATCH = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const [row] = await scopedRepo(deliveries).update(eq(deliveries.id, id), updates)
    return NextResponse.json({ success: true, data: row })
  } catch (err: any) {
    console.error('[API] PATCH /api/deliveries error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
