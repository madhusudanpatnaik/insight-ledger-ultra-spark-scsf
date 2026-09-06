import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { report_messages } from '@/lib/db/schema'
import { eq, desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

export const GET = authMiddleware(async (req: NextRequest) => {
  try {
    const report_id = new URL(req.url).searchParams.get('report_id')
    const repo = scopedRepo(report_messages)
    const rows = report_id
      ? await repo.findMany({ where: eq(report_messages.report_id, report_id), orderBy: desc(report_messages.created_at) })
      : await repo.findMany({ orderBy: desc(report_messages.created_at) })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/report-messages error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const [row] = await scopedRepo(report_messages).insert({
      report_id: body.report_id,
      sender: body.sender,
      content: body.content,
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/report-messages error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
