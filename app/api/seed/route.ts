import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { reports, evidence_gaps } from '@/lib/db/schema'
import { NextResponse } from 'next/server'

export const POST = authMiddleware(async () => {
  try {
    const repo = scopedRepo(reports)
    const n = await repo.count()
    if (n === 0) {
      const [row] = await repo.insert({
        title: 'Q2 quarterly review',
        question: 'Why did sales decline in Q2?',
        template_id: null,
        dataset_ids: ['sample-sales.xlsx', 'sample-customers.csv', 'sample-board-report.pdf'],
        stats_pack: {
          period: 'April\u2013June 2025',
          baseline_period: 'January\u2013March 2025',
          metrics: {
            bookings_net_total: 4820000,
            bookings_prior_total: 5480000,
            bookings_decline_pct: 12,
            average_order_value: 1240,
            apac_enterprise_accounts: 11,
            weekly_bookings: [480000, 476000, 470000, 465000, 460000, 452000, 430000, 415000, 405000, 398000, 392000, 388000, 386000],
          },
          row_counts: { 'sample-sales.xlsx': 38940, 'sample-customers.csv': 6204 },
        },
        report_json: {
          title: 'Q2 quarterly review',
          period: 'April\u2013June 2025',
          executive_summary: 'Bookings fell 12% over the quarter. The fall is concentrated in enterprise accounts in APAC.',
          overall_confidence: 'moderate',
          cannot_prove: 'These files hold no cost, churn or pricing data, so this report stops at where the decline happened, not why.',
          sections: [
            {
              heading: 'What happened',
              status: 'supported',
              narrative: 'Bookings fell from $5.48M to $4.82M. The drop was not gradual \u2014 it began in week 7 and held at the lower level for the rest of the quarter.',
              body: null,
              claims: [{ id: 'c1', text: 'Bookings fell 12%, from $5.48M to $4.82M.', class: 'proven', basis: 'sales.xlsx weekly totals', alternative: null }],
              chart_spec: { type: 'line', caption: 'Bookings fell from week 7 onward and did not recover.', stats_pack_keys: ['metrics.weekly_bookings'] },
            },
            {
              heading: "Why we can't tell yet",
              status: 'cannot_support',
              narrative: 'These files hold no cost, churn or pricing data, so we cannot establish why bookings fell \u2014 only where.',
              body: null,
              claims: [],
              chart_spec: null,
            },
            {
              heading: 'What you should know',
              status: 'supported',
              narrative: '',
              body: null,
              claims: [
                { id: 'c2', text: 'Bookings fell 12%, from $5.48M to $4.82M.', class: 'proven', basis: 'sales.xlsx', alternative: null },
                { id: 'c3', text: 'Average order value held at $1,240, so this is a volume story.', class: 'proven', basis: 'sales.xlsx', alternative: null },
                { id: 'c4', text: 'The fall is concentrated in 11 APAC enterprise accounts.', class: 'inferred', basis: 'segment split by region and tier', alternative: "Eleven accounts is a small base \u2014 two slipped renewals would produce the same pattern." },
                { id: 'c5', text: 'Did customers leave, or did existing ones spend less?', class: 'unknown', basis: 'no customer-level data present', alternative: 'Customer-level churn data would settle it.' },
              ],
              chart_spec: null,
            },
            {
              heading: "What you're missing",
              status: 'supported',
              narrative: '',
              body: null,
              claims: [],
              chart_spec: null,
            },
            {
              heading: 'What to do next',
              status: 'supported',
              narrative: '',
              body: null,
              claims: [],
              chart_spec: null,
            },
          ],
          gap_ledger: [
            { field: 'customer_level_data', action_phrase: 'Add customer-level data \u2192 could explain the 18% enterprise decline and change 2 conclusions', tier: 'critical', expected_impact: 'high', conclusions_affected: 2, from_template: false },
            { field: 'pricing_history', action_phrase: 'Add pricing history \u2192 would separate price from volume and add 1 conclusion', tier: 'high', expected_impact: 'medium', conclusions_affected: 1, from_template: false },
            { field: 'cost_data', action_phrase: 'Add cost data \u2192 fills the Margin review section your template expects', tier: 'optional', expected_impact: 'low', conclusions_affected: 0, from_template: false },
          ],
          quality_review: { claims_rejected: [], what_could_mislead_a_skimmer: 'Average order value looking flat could suggest nothing changed \u2014 the decline is entirely in volume, concentrated regionally.', what_we_missed: 'Customer-level retention data.' },
          charts: [{ type: 'line', caption: 'Bookings fell from week 7 onward and did not recover.', stats_pack_keys: ['metrics.weekly_bookings'] }],
          evidence_strength: { proven_count: 2, inferred_count: 1, unknown_count: 1, basis_summary: 'Two proven findings, one inferred with a stated alternative, one open question.' },
          change_summary: null,
        },
        evidence_strength: 71,
        strength_components: { data_completeness: 20, source_consistency: 14, evidence_coverage: 12, analytical_coverage: 16, freshness: 9 },
        version: 1,
        parent_report_id: null,
        change_summary: null,
        status: 'current',
      })
      if (row?.id) {
        const gapsRepo = scopedRepo(evidence_gaps)
        await gapsRepo.insert([
          { report_id: row.id, field_name: 'customer_level_data', plain_label: 'Customer-level data', action_phrase: 'Add customer-level data \u2192 could explain the 18% enterprise decline and change 2 conclusions', tier: 'critical', why_it_matters: 'We can see bookings falling, but not whether accounts left.', unlocks_question: 'Did customer loss cause the decline?', explains_figure: '18% enterprise decline', expected_impact: 'high', conclusions_affected: 2, from_template: false, resolved: false },
          { report_id: row.id, field_name: 'pricing_history', plain_label: 'Pricing history', action_phrase: 'Add pricing history \u2192 would separate price from volume and add 1 conclusion', tier: 'high', why_it_matters: 'Bookings moved; we cannot tell whether discounts moved with them.', unlocks_question: 'Did we discount our way into this?', explains_figure: 'bookings movement', expected_impact: 'medium', conclusions_affected: 1, from_template: false, resolved: false },
          { report_id: row.id, field_name: 'cost_data', plain_label: 'Cost data', action_phrase: 'Add cost data \u2192 fills the Margin review section your template expects', tier: 'optional', why_it_matters: 'Your template reports gross margin; nothing here supports it.', unlocks_question: 'Was the quarter profitable, not just smaller?', explains_figure: 'gross margin', expected_impact: 'low', conclusions_affected: 0, from_template: true, resolved: false },
        ])
      }
    }
    return NextResponse.json({ seeded: n === 0 })
  } catch (err: any) {
    console.error('[API] POST /api/seed error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
