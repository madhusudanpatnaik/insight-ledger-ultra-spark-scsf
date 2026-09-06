/**
 * Evidence — AI Reporting Analyst — database schema (PostgreSQL via Drizzle).
 */
export { users } from "lyzr-architect-pg/schema";
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  index,
  timestamps,
  ownerUserId,
  generateId,
} from "lyzr-architect-pg/schema";

// Uploaded files (data sources or templates) and their computed profile.
export const datasets = pgTable(
  "datasets",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    owner_user_id: ownerUserId(),
    name: text("name").notNull(),
    source_type: text("source_type").notNull(), // csv | xlsx | json | pdf | docx
    role: text("role").notNull().default("source"), // source | template
    row_count: integer("row_count"),
    column_count: integer("column_count"),
    page_count: integer("page_count"),
    grain: text("grain"),
    period_start: text("period_start"),
    period_end: text("period_end"),
    units: text("units"),
    profile_json: jsonb("profile_json"),
    extracted_text: text("extracted_text"),
    ...timestamps,
  },
  (t) => [index("datasets_owner_idx").on(t.owner_user_id)]
);

// Reusable house report formats, saved per workspace.
export const report_templates = pgTable(
  "report_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    owner_user_id: ownerUserId(),
    name: text("name").notNull(),
    source_file: text("source_file").notNull().default(""),
    structure_json: jsonb("structure_json"),
    expected_metrics: jsonb("expected_metrics"),
    times_used: integer("times_used").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("report_templates_owner_idx").on(t.owner_user_id)]
);

// Reports and their structure, versioned per run.
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    owner_user_id: ownerUserId(),
    title: text("title").notNull(),
    question: text("question"),
    template_id: text("template_id"),
    dataset_ids: jsonb("dataset_ids"),
    stats_pack: jsonb("stats_pack"),
    report_json: jsonb("report_json"),
    evidence_strength: integer("evidence_strength").notNull().default(0),
    strength_components: jsonb("strength_components"),
    version: integer("version").notNull().default(1),
    parent_report_id: text("parent_report_id"),
    change_summary: jsonb("change_summary"),
    status: text("status").notNull().default("draft"), // draft | current | pending_decisions | superseded
    ...timestamps,
  },
  (t) => [index("reports_owner_idx").on(t.owner_user_id)]
);

// Figures pulled from PDF/Word, with provenance.
export const extracted_facts = pgTable(
  "extracted_facts",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    dataset_id: text("dataset_id").notNull(),
    label: text("label").notNull(),
    value_text: text("value_text").notNull(),
    period: text("period"),
    page_number: integer("page_number"),
    verified: boolean("verified").notNull().default(false),
    conflicts_with: text("conflicts_with"),
    ...timestamps,
  },
  (t) => [index("extracted_facts_dataset_idx").on(t.dataset_id)]
);

// Cross-file grain/unit/period/definition verdicts.
export const compatibility_checks = pgTable(
  "compatibility_checks",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    report_id: text("report_id").notNull(),
    dataset_a_id: text("dataset_a_id"),
    dataset_b_id: text("dataset_b_id"),
    axis: text("axis").notNull(), // grain | units | currency | period | definition
    verdict: text("verdict").notNull(), // compatible | reconcilable | incompatible
    proposed_reconciliation: text("proposed_reconciliation"),
    resolved: boolean("resolved").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("compatibility_checks_report_idx").on(t.report_id)]
);

// User decisions, batched until applied.
export const resolutions = pgTable(
  "resolutions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    report_id: text("report_id").notNull(),
    target_type: text("target_type").notNull(), // conflict | gap | fact | compatibility
    target_id: text("target_id"),
    action: text("action").notNull(), // accept_recommendation | choose_source | correct_definition | supply_value | verify | dismiss
    chosen_value: text("chosen_value"),
    reason: text("reason"),
    basis: text("basis"),
    decided_by: text("decided_by"),
    applied_in_version: integer("applied_in_version"),
    ...timestamps,
  },
  (t) => [index("resolutions_report_idx").on(t.report_id)]
);

// Gap ledger — surfaced as "what you're missing".
export const evidence_gaps = pgTable(
  "evidence_gaps",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    report_id: text("report_id").notNull(),
    field_name: text("field_name").notNull(),
    plain_label: text("plain_label").notNull(),
    action_phrase: text("action_phrase").notNull(),
    tier: text("tier").notNull().default("optional"), // critical | high | optional
    why_it_matters: text("why_it_matters"),
    unlocks_question: text("unlocks_question"),
    explains_figure: text("explains_figure"),
    expected_impact: text("expected_impact").notNull().default("low"), // high | medium | low
    conclusions_affected: integer("conclusions_affected").notNull().default(0),
    from_template: boolean("from_template").notNull().default(false),
    resolved: boolean("resolved").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("evidence_gaps_report_idx").on(t.report_id)]
);

// Follow-up Q&A thread per report.
export const report_messages = pgTable(
  "report_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    report_id: text("report_id").notNull(),
    sender: text("sender").notNull(), // user | agent
    content: text("content").notNull(),
    ...timestamps,
  },
  (t) => [index("report_messages_report_idx").on(t.report_id)]
);

// Record of every send.
export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    report_id: text("report_id").notNull(),
    report_version: integer("report_version").notNull().default(1),
    channel: text("channel").notNull(), // email | slack
    recipients: jsonb("recipients"),
    message_body: text("message_body"),
    sent_by: text("sent_by"),
    status: text("status").notNull().default("draft"), // draft | sent | failed
    error_detail: text("error_detail"),
    sent_at: text("sent_at"),
    ...timestamps,
  },
  (t) => [index("deliveries_report_idx").on(t.report_id)]
);
