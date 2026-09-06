All five in. I'm re-emitting the plan in full rather than patching it — the last update left stray markup in the responsive-behaviour table and the artifacts list, and that needs to be clean before build.

# Evidence — AI Reporting Analyst

## 1. Overview
Evidence turns messy, mixed-format data — spreadsheets, JSON feeds, PDFs and Word documents — into a premium report that is honest about its own limits. It computes every number deterministically, then uses agents to interpret them, audit the evidence behind each claim, state what the data **cannot** prove, and name exactly what would make the analysis stronger. **Every conclusion is classified proven, inferred, or unknown, and the app never manufactures an answer to fill a heading.** If you already have a house report format, upload it once and Evidence writes into that shape with your new data.

**Simple surface, sophisticated engine.** Provenance, confidence, resolution records, versioning and quoted-figure audits run on every report, but the default interface shows almost none of it. A first-time user drops files and reads an answer. Everything analytical sits one click behind **Show evidence**, and every decision the app asks for arrives already adjudicated.

**The improve loop is the product's identity, not a feature.** Evidence is not "AI that writes reports" — it is the thing that tells you how to make your analysis stronger and proves the difference when you do. **What you're missing** and **Improve report** get the most prominent placement and the most agent intelligence. Q&A, delivery, versioning and export are supporting cast; any build tradeoff resolves in favour of the improve loop.

## 2. User Stories
- As someone who is not an analyst, I want to drop in files and get a readable answer, without configuring anything.
- As an analyst, I want correct math on CSV/Excel/JSON so I stop rebuilding pivot tables.
- As an analyst, I want PDFs and Word documents read for their tables and figures with a page reference, so last quarter's board deck counts as evidence.
- As a manager, I want to be told plainly what I'm missing, what it would let me conclude, and whether it's worth the effort to go and get it.
- As a manager, I want the app to recommend which of two conflicting figures to trust, so I accept in one click instead of adjudicating.
- As an analyst, I want to settle several questions and then update the report once, rather than watching it rebuild after every click.
- As a reviewer, I want to see what changed between versions and who decided it.
- As an analyst, I want the app to refuse to combine two datasets that measure different things, rather than quietly averaging them.
- As a reader, I want to see at a glance which conclusions the data proves, which are inferred, and which are unknown, so I never mistake a guess for a fact.
- As an analyst, I want to upload our existing report template so the output follows our house structure and tone with the new data, instead of me reformatting it every quarter.
- As a stakeholder, I want a premium PDF, and an emailed or Slack-posted summary I can approve before it goes.

## 3.a. Agent Architecture

**Pattern:** Manager–Subagent for report generation, plus three Independent agents (Q&A, email delivery, Slack delivery).

**Reasoning:** One action produces one finished report, but it needs three different specializations over the same computed pack. Q&A and delivery happen later, on a saved report, and are separately triggered.

**The inviolable rule: the LLM never calculates.** A dedicated computation step — separate from every agent — produces row/null counts, type inference, cardinality, date range and freshness, growth rates, percentages, averages, medians, variance, outliers (IQR/z-score), correlations, aggregations, segment splits and simple projections. Its output is an **immutable Stats Pack**: written once per run, stored verbatim, never edited by an agent or the UI. Every number in the report, the PDF and any delivered message is read by key from that pack. If a number is not in the pack, it cannot appear anywhere.

**Where computation runs:** v1 computes in the browser — fast, private, no upload round-trip. The pipeline is staged deliberately as *upload → parse → deterministic engine → immutable Stats Pack → agents*, so the engine can be lifted server-side later without touching agents, report format or UI. Two runs over the same files must produce an identical pack.

**Claim classification (anti-hallucination, enforced at the source):** every conclusion in the report carries exactly one of three classes, and the class is structural — it is a required field on the claim object, not a phrasing choice.

| Class | Means | Requires | Shown as |
|---|---|---|---|
| **Proven** | Computed directly from the data | Stats Pack keys, sample above the 30-observation threshold, no unresolved conflict touching it | Stated plainly, no hedge |
| **Inferred** | A reasonable reading the data supports but does not establish | Named basis, plus the alternative explanation it cannot rule out | Marked as a reading, with the alternative stated in the same breath |
| **Unknown** | The data cannot answer this | Named as a question, with what would settle it | Stated as an open question, never as a soft conclusion |

Hard rules the build must enforce: a claim with no Stats Pack key cannot be `proven`; an `inferred` claim without a stated alternative is rejected and re-written; `unknown` is a valid and expected outcome that must never be upgraded to fill a section; and causal language ("drove", "caused", "because") is reserved for `proven` claims only — an inferred driver reads "the fall is concentrated in X", not "X caused the fall". Where the model cannot classify honestly, it returns `unknown` rather than guessing. **Never force an answer when the evidence is insufficient** is the single rule that outranks every other instruction in this plan.

**Dataset compatibility (the correctness gate):** **Never combine datasets unless their grain, units, currency, time period and metric definitions are compatible or explicitly reconciled.** Before any cross-file figure is computed, the Source Understanding Agent must establish compatibility on all five axes. Where it cannot, the files are analysed separately and the mismatch is raised as a conflict with a recommendation ("sales.xlsx is monthly, board.pdf is quarterly — I'd roll monthly up to quarterly to compare"). Silent aggregation across incompatible grain is the failure mode most likely to produce a beautiful, wrong report, so this is a **hard block, not a warning**: an incompatible pair cannot produce a combined figure at all. The computation step refuses to emit the key, so no agent can reference a number that does not exist. The blocked claim is replaced by a plain explanation naming the exact axis that failed and what would unblock it ("the deck reports bookings gross of refunds and the spreadsheet is net — these are different measures, so I have not combined them"). Rolling a finer grain up to a coarser one is permitted and stated; splitting a coarser figure into a finer one is invention and is always refused. A blocked claim is a correct outcome, reported as such, never a silent omission.

**Document ingestion:** PDFs and DOCX are text-extracted in the browser (pdf.js / mammoth) into pages with detected tables. A cleanly parsed table joins the deterministic pipeline like a CSV. Prose figures become **facts with provenance** — value, label, period, file, page — marked `unverified`, capped at moderate confidence, visibly attributed, and never able to anchor a headline finding alone.

**Guided resolution, batched application:** Every conflict arrives already adjudicated. The app states it plainly ("I found two different revenue figures"), names the recommendation and its one-sentence reason, and offers two controls: **Use $4.82M** and **Review sources**. Accepting is one click and needs no reason.

Accepting does **not** re-run the report. Decisions accumulate into a pending set shown as a quiet bar — "3 decisions applied · **Update report**" — and the Coordinator runs **once** when the user is ready. This keeps the experience fast and cheap while staying single-click per decision. Affected claims are marked as awaiting update in the meantime, never silently stale.

**Review sources** opens the full apparatus: choose either source, correct a definition, supply a value, verify a quoted figure, or dismiss with a written reason. A one-click acceptance is recorded as a resolution exactly like a manual one, with the recommendation logged as its basis, so the audit trail is identical either way. Nothing overwrites a source file; dismissed items move to a collapsed **Settled** list with their reason attached.

**Agent Flow:** The user drops files (and optionally types a question) on **Create**, then clicks **Generate report**. The frontend parses everything, checks compatibility, computes the immutable Stats Pack, and calls the **Report Architect Coordinator**, which fans it out to three sub-agents — Source Understanding, Evidence Auditor, Insight Analyst — with no CTAs of their own. The Coordinator aggregates, runs the closing quality pass, decides which findings earn a chart, and returns one structured report object. **The UI never names an agent**: the user sees five plain ticks — Reading your files, Checking data quality, Finding patterns, Checking what's missing, Writing the report.

**Update report** is the Coordinator's second trigger: same pack, now with the pending resolution set attached as binding constraints, producing version n+1 and a change summary. **Ask a question** triggers the independent **Report Q&A Analyst**, scoped to that report's pack and resolutions.

Delivery is separate and human-gated. **Send report** opens a share dialog; **Draft message** calls the **Email Delivery Agent** (Gmail) or **Slack Delivery Agent** (Slack), which writes a covering note from the report object only. The user edits, then sends — PDF attached for email, link plus summary for Slack. A report with pending decisions blocks the send until updated, or the user explicitly sends the older version.

**Data Sources Detected:** 5 — tabular files (CSV/Excel), JSON payloads, PDF/Word documents (text + detected tables), prior saved reports as baseline, and an optional **report template** (PDF/DOCX/previous report) used as build context for structure and tone, never as data. All data arrives as a computed Stats Pack plus an extracted-facts list.

**Agents Table:**
| Agent Type | Agent Name | Description | Tools/Data Sources | Trigger | Provider | Model | Temperature | Top_p |
|---|---|---|---|---|---|---|---|---|
| Manager | Report Architect Coordinator | Routes the Stats Pack to sub-agents; decides report structure and **which sections the evidence can actually support** — replacing an unsupported section with an honest "we can't tell yet" rather than filling it; applies the chart-necessity test (max five, "none needed" is valid); **conforms the output to an uploaded report template when one exists — matching its section order, headings, tone and table shapes, while never letting the template force a section the evidence cannot support**; runs the closing quality review, which rejects any claim missing a proven/inferred/unknown class or any inferred claim without a stated alternative; returns one structured report object. On update runs, applies the pending resolution set as binding constraints and reports what changed | N/A | "Generate report" on Create, "Update report" on Report | Anthropic | anthropic/claude-opus-4-6 | 0.3 | 1 |
| Sub-Agent | Source Understanding Agent | Interprets the computed profile (entities, metrics vs dimensions vs timestamps, grain, time-series, cross-file relationships); **enforces the compatibility gate on grain, units, currency, period and definitions before any cross-file figure is used**; extracts PDF/DOCX figures into labelled facts with file + page provenance, marked unverified; reports every mismatch as a conflict with a proposed reconciliation | Computed Data Profile + extracted document text | Auto (via Manager) | Anthropic | anthropic/claude-sonnet-4-6 | 0.2 | 1 |
| Sub-Agent | Evidence Auditor Agent | Flags missing, conflicting, stale, biased and insufficient evidence; downgrades claims resting on unverified figures; honors settled decisions and never re-raises them unless new data contradicts; produces the gap ledger phrased as "what you're missing", where **every item is written as an action with a consequence** — "Add customer-level data → could explain the 18% decline and change 2 conclusions" — naming the specific figure it would explain and the exact count of conclusions it would add or change, never a bare noun like "missing customer data"; recommends a resolution for every conflict so the UI can offer one accept button; uses the actionable-gap-phrasing skill | Computed Data Profile + quality metrics | Auto (via Manager) | Anthropic | anthropic/claude-sonnet-4-6 | 0.2 | 1 |
| Sub-Agent | Insight Analyst Agent | Interprets computed trends, anomalies, correlations, segments and projections into claims, **each classified proven / inferred / unknown with its basis, and each inferred claim carrying the alternative explanation it cannot rule out**; writes the report as answers to the questions the evidence can actually answer, in language a non-analyst reads without a glossary; states plainly when a question cannot be answered instead of producing weak analysis; never restates a number the pack did not compute | Computed Stats Pack + prior report baseline | Auto (via Manager) | Anthropic | anthropic/claude-sonnet-4-6 | 0.3 | 1 |
| Independent | Report Q&A Analyst | Answers follow-ups against one saved report's Stats Pack and resolutions; refuses to speculate beyond it and points to the relevant gap instead | Saved report Stats Pack | "Ask a question" on Report | Anthropic | anthropic/claude-sonnet-4-5 | 0.3 | 1 |
| Independent | Email Delivery Agent | Drafts a short covering email from the report object — headline finding, evidence strength, open critical gaps, version — and sends it with the PDF attached once approved; quotes no number the report does not contain | gmail (GMAIL_SEND_EMAIL) | "Draft message" then "Send" in the Share dialog | Anthropic | anthropic/claude-sonnet-4-5 | 0.3 | 1 |
| Independent | Slack Delivery Agent | Drafts a tighter channel summary of the same report object and posts it with a report link once approved | slack (SLACK_CHAT_POST_MESSAGE) | "Draft message" then "Send" in the Share dialog | Anthropic | anthropic/claude-sonnet-4-5 | 0.3 | 1 |

Web search is **off** for every agent — all grounding comes from the user's own data, and search preambles would corrupt the structured JSON response.

**Workflow Visualization:** The Input Node sits at the far left. The Report Architect Coordinator connects to its right at the same vertical level. Directly below the Coordinator, three sub-agents — Source Understanding, Evidence Auditor, Insight Analyst — sit in a horizontal row at the same vertical level, evenly spaced, each fed by a bottom connection. To the right of the Coordinator, at its level, the Report Q&A Analyst, Email Delivery Agent and Slack Delivery Agent sit as three independently triggered nodes.

**Connection Summary:**
- Input → Report Architect Coordinator: Right
- Coordinator → Source Understanding / Evidence Auditor / Insight Analyst: Bottom (horizontal row)
- Coordinator → Report Q&A Analyst: Right (separate trigger)
- Coordinator → Email Delivery Agent: Right (separate trigger, after approval)
- Coordinator → Slack Delivery Agent: Right (separate trigger, after approval)

## 3.b. Adaptive report structure

The five questions are the report's *spine, not a template*. The Coordinator includes a section only when the evidence supports it.

- If the data cannot establish cause, section two becomes **"Why we can't tell yet"** — one honest paragraph naming what is missing and what would settle it. It never contains speculative analysis.
- A section with nothing to say is omitted or replaced by its honest counterpart; the layout must look deliberate either way.
- **What you're missing** is never omitted. It is the one section that always appears.
- **Rule: no analysis is better than invented analysis.** A weak paragraph written to fill a heading is a defect, not a nicety.

## 3.b.1 Report templates (optional, build context)

A user can upload their existing report — a PDF, DOCX, or a previous Evidence report — as a **template**. It is build context, not data: the app reads its structure and voice and writes the new analysis into that shape.

**What the template governs:** section order and headings, tone and sentence register, table shapes and column labels, chart conventions, terminology (if the house word is "bookings", the report says bookings), and length per section.

**What the template never governs:** the numbers. No figure, period, or finding is ever carried over from the template — every value still comes from the Stats Pack computed on the new data. A number appearing in the template is treated as an example of format, never as a fact, and is explicitly excluded from the extracted-facts pipeline when the file is marked as a template rather than a source.

**Where the template yields:** if the template has a section the evidence cannot support, that section becomes its honest counterpart ("Why we can't tell yet") rather than being filled — template conformance never overrides the anti-hallucination rule. If the template expects a metric the new data lacks, that becomes a **what you're missing** item phrased against the template ("Your template reports gross margin — add cost data to fill that section"), which is one of the most useful gap signals the app can produce. Conversely, a strong finding the template has no home for is appended in a clearly marked additional section rather than dropped.

Templates are saved per workspace and reusable: upload once, then pick it from a short list on later reports.

## 3.c. Charts: earn the space

**Show a chart only when it communicates something the sentence cannot.** A single number, or a comparison of two values, belongs in the prose. A shape over time, a composition, a distribution or a relationship earns a chart.

- At most **five charts** per report; three excellent ones beat eight impressive ones.
- "No visualization needed here" is a valid, expected answer for any section.
- Every chart carries a caption saying what it proves, and is drawn only from Stats Pack keys.
- Never chart the same finding twice, never decorate, never fill a section.

## 3.d. File Output Configuration
| Agent Name | Use Case | Output Format(s) |
|---|---|---|
| Report Architect Coordinator | Full report with charts, findings, evidence strength and the missing-data list, exported for circulation | PDF |

## 3.e. Evidence Strength

Displayed as **Evidence strength · 71**, always with the line *"How well the available evidence supports this report."* Never called a score, a grade, or report quality, and never presented as a measure of business performance. Computed deterministically from the Stats Pack and audit output — not judged by a model — so identical inputs always give an identical number.

| Component | Weight | Measured from |
|---|---|---|
| Data completeness | 25 | Null rates on the metrics actually used; record counts against the 30-observation threshold |
| Source consistency | 20 | Unresolved conflicts, definition mismatches, and failed compatibility checks |
| Evidence coverage | 25 | Open critical and high-value gaps against the decision the report supports |
| Analytical coverage | 20 | How many applicable analyses (trend, segmentation, relationship, distribution) the data supports |
| Freshness | 10 | Age of the latest record against the report period |

The number is never shown without a route to its breakdown: five components, each contribution, and the single change that would raise it most.

## 3.f. Database Configuration

**Database:** PostgreSQL (built-in Lyzr Studio database)

**User Management:** Required — email/password signup and login; all screens gated behind authentication.

| Table | Purpose | Key Columns |
|---|---|---|
| users | Accounts and roles | id, email, password_hash, name, role, created_at |
| datasets | Uploaded files and their computed profile | id, owner_user_id (FK → users.id), name, source_type (csv/xlsx/json/pdf/docx), role (source/template), row_count, column_count, page_count, grain, period_start, period_end, units, profile_json (JSONB), extracted_text, created_at |
| report_templates | Reusable house report formats, saved per workspace | id, owner_user_id (FK → users.id), name, source_file, structure_json (JSONB — section order, headings, tone notes, table shapes, terminology), expected_metrics (JSONB), times_used int, created_at |
| extracted_facts | Figures pulled from PDF/Word, with provenance | id, dataset_id (FK → datasets.id), label, value_text, period, page_number, verified boolean, conflicts_with (nullable), created_at |
| compatibility_checks | Cross-file grain/unit/period/definition verdicts | id, report_id (FK → reports.id), dataset_a_id, dataset_b_id, axis (grain/units/currency/period/definition), verdict (compatible/reconcilable/incompatible), proposed_reconciliation, resolved boolean |
| resolutions | User decisions, batched until applied | id, report_id (FK → reports.id), target_type (conflict/gap/fact/compatibility), target_id, action (accept_recommendation/choose_source/correct_definition/supply_value/verify/dismiss), chosen_value (nullable), reason (nullable for one-click accepts), basis (the recommendation accepted), decided_by (FK → users.id), applied_in_version (null while pending), created_at |
| reports | Reports and their structure, versioned per run | id, owner_user_id (FK), title, question (nullable), template_id (nullable, FK → report_templates.id), dataset_ids (JSONB), stats_pack (JSONB, immutable), report_json (JSONB — every claim carries `class` proven/inferred/unknown, `basis`, and `alternative` for inferred), evidence_strength int, strength_components (JSONB), version int, parent_report_id (nullable, FK → reports.id), change_summary (JSONB), status (draft/current/pending_decisions/superseded), created_at |
| evidence_gaps | Gap ledger — surfaced as "what you're missing" | id, report_id (FK → reports.id), field_name, plain_label, action_phrase (the full "Add X → could explain Y and change N conclusions" line), tier (critical/high/optional), why_it_matters, unlocks_question, explains_figure (the specific number it would account for), expected_impact (high/medium/low), conclusions_affected int, from_template boolean, resolved boolean |
| report_messages | Follow-up Q&A thread per report | id, report_id (FK), sender (user/agent), content, created_at |
| deliveries | Record of every send | id, report_id (FK), report_version int, channel (email/slack), recipients (JSONB), message_body, sent_by (FK → users.id), status (draft/sent/failed), error_detail, sent_at |

**Roles:**
| Role | Access Level |
|---|---|
| admin | Manage users, view all reports in the workspace |
| user | Upload data, generate reports, view and export own reports |

**Authentication Flow:** The app is visible but slightly blurred behind a themed auth modal defaulting to Sign Up; new users create an account, returning users log in, and all routes are protected.

## 4. User Flow
1. User lands on the app, lightly blurred behind the Sign Up modal → signs up or logs in.
2. Reports list shows past work; user clicks **New report**.
3. **One required input.** Drop files — that is the whole requirement. Beneath, a visually secondary optional field asks what they want to understand; blank produces a general review. Period and baseline are auto-detected and shown as one editable sentence.
4. Files parse locally, one readable line each. Compatibility is checked as they land; a mismatch appears immediately as a plain note with a proposed fix, and an incompatible pair is shown as blocked with the axis that failed named in one sentence.
4b. Optionally, the user drops a **report template** — last quarter's report, a house format — or picks a saved one. It is marked as a template, excluded from the data pipeline, and shown as "I'll follow this structure and use your new data for the numbers."
5. **Generate report** → five plain ticks: Reading your files, Checking data quality, Finding patterns, Checking what's missing, Writing the report.
6. The report answers only the questions the evidence supports, in the template's shape if one was given. Every conclusion is visibly proven, inferred (with the alternative it can't rule out) or unknown. Where cause cannot be established, it says so under "Why we can't tell yet" rather than guessing. Charts appear only where they add something, capped at five.
7. Uncertainty appears inline as a recommendation with one accept button. Accepting records the decision and adds it to a pending set — the report does **not** re-run yet.
8. A quiet bar shows "3 decisions applied · **Update report**". One click runs the Coordinator once, producing the next version with a change summary.
9. **What you're missing** lists at most three items, each with the question it unlocks and its expected impact. One button: **Improve report**.
10. **Improve** shows each item as an action with its consequence — "Add customer-level data → could explain the 18% decline and change 2 conclusions" — plus an upload control. Adding a file updates the report and lands the product's strongest moment: **Evidence strength 71 → 89 · 3 new conclusions · 2 conclusions changed · 1 uncertainty resolved**, each line expandable to the exact claim that moved and, where a claim was promoted, the words "this was inferred, now it's proven".
11. Everything analytical lives behind **Show evidence** and version history. Nothing is removed, only out of the way.
12. **Send report** → share dialog → **Draft message** → edit → **Send**. Pending decisions block the send until updated, or the user explicitly sends the older version.

## 5. Integrations Required
Ingestion and analysis need no integrations — spreadsheet, JSON, PDF and DOCX parsing, statistical computation, charting and PDF export all run in the frontend (pdf.js, mammoth). Delivery uses two integrations, one per agent.

| Tool Name | Tool Source | Actions Required | Used By Agent | User Input Required |
|---|---|---|---|---|
| gmail | composio | GMAIL_SEND_EMAIL | Email Delivery Agent | Recipient addresses, subject (pre-filled), covering message (drafted, editable), PDF attachment (auto) |
| slack | composio | SLACK_CHAT_POST_MESSAGE | Slack Delivery Agent | Channel name or ID, message body (drafted, editable) |

> **Note:** Scanned PDFs with no text layer are out of scope for v1 — OCR would need a custom tool or an MCP server. Live external benchmarking would need web search enabled on the Insight Analyst, or an MCP server added via the "+" / "Add MCP server" button in the composer.

## 6. UI/UX Specification

### App Structure
Three screens carry the product: **Create**, **Report**, **Improve**. The left rail holds exactly three entries — **Reports**, **New report** (visually dominant), **Settings**. Datasets, sources, evidence, versions and conflicts get no top-level navigation; each is reached from the report it belongs to. The report is a single centred reading column, not a dashboard.

**Progressive disclosure is the design rule.** Layer one is prose and the few charts that earn their place. Layer two, one click away via **Show evidence**, is confidence and provenance. Layer three is the full resolution and version machinery. No user must descend past layer one to finish a report.

**Language rule:** the interface never uses internal vocabulary. "Evidence gap" is **what you're missing**; the score is **evidence strength**; "Stats Pack", "coordinator", "sub-agent" and "provenance" never appear on screen, and no agent is ever named.

### Design System
**Components:** reading column with section rules, restrained chart frames with proving captions, plain finding lines, recommendation blocks with a single accept button, a pending-decisions bar, missing-item cards carrying a severity dot and an expected-impact marker, the evidence strength meter with its breakdown, plain-language progress ticks, an inline evidence layer, source drawer, toast confirmations.
**Visual Hierarchy:** 8pt grid; large title, quiet meta, generous reading measure. Structure comes from rules and alignment, not stacked identical cards — the page reads like a well-set document, not a dashboard.
**Information Density:** Ordered rather than dense. Prose under 80 characters per line; whitespace separates arguments rather than padding them.

### Screens

**Screen 0 — Log In:** Centred card, email + password, "Log in", link to sign up, inline error for bad credentials.
**Screen 0b — Sign Up:** Centred card, name/email/password, "Create account", field-level validation, link to log in.

**Screen 1 — Reports:** A quiet list — title, period, evidence strength, and how many things are still missing. Row click opens the report. The empty state is an invitation: one line explaining what happens when you drop a file, a **New report** button, and a sample dataset to try.

**Screen 2 — Create:** The drop zone dominates ("Drop your files here — Excel, CSV, PDF, Word, JSON"). Beneath it, smaller and quieter, two optional controls sit on one row: a field labelled "What do you want to understand? (optional)" with a real example as placeholder, and **"Follow a report template (optional)"** — a saved-template picker plus an upload control. A chosen template shows one confirming line ("Following Quarterly board format — 5 sections, your numbers") and a link to see the structure it detected. Any file added here is visibly marked as a template, never counted as data. **Generate report** activates on the first parsed file. Each file collapses to one line — name, what was found, tick or problem. Detected period and baseline appear as one editable sentence. A compatibility note appears inline when files disagree on grain, units or period, with the proposed reconciliation stated plainly. Errors name the fix in plain words.

**Screen 3 — Report:** One reading column. Sections appear only when supported:
1. **What happened** — the answer in two or three sentences, then the chart that shows the movement.
2. **Why**, or **Why we can't tell yet** — drivers in prose, or an honest paragraph naming what would settle it. A chart only if the shape isn't obvious from the sentence.
3. **What you should know** — three to five plain findings, including anything that could mislead a skimmer. Each carries a quiet class marker: proven findings read straight; inferred findings say what they cannot rule out in the same sentence; unknowns appear as open questions. The markers are typographic and calm — a small label, not a badge wall — and are legible without the evidence layer turned on.
4. **What you're missing** — always present, and written as instructions rather than nouns. Each of the at-most-three items leads with the action and its payoff on one line — "Add customer-level data → could explain the 18% decline and change 2 conclusions" — then one line of why, then the question it would answer. Severity is a dot; impact is stated in conclusions, not adjectives. If a template is in use, an item may read "Your template reports gross margin — add cost data to fill that section". One button: **Improve report**, the most prominent control on the page.
5. **What to do next** — two or three ordered actions.

The header carries title, detected period, **Evidence strength · 71** with its caption and clickable breakdown, and the actions **Show evidence**, **Download PDF**, **Send report**, **Ask a question**.

Uncertainty appears inline: the problem in one sentence, the recommendation with its reason, and two buttons — accept, or **Review sources**. Accepting confirms with a small "Decision recorded" marker and increments the pending-decisions bar; it does not re-run. The bar reads "3 decisions applied · **Update report**" and sits above the reading column, non-blocking, with affected findings marked "will update".

**Show evidence** (off by default) reveals confidence per finding, provenance on every number, quoted figures with page references, the full "what this cannot prove" statement, compatibility verdicts, settled decisions, and the version switcher — all inline, without moving the layout.

**Screen 3b — Improve:** The defining screen — build it first, polish it hardest. Opens with "I found 3 things that would make this analysis stronger." Each card carries the plain title, one-sentence why, "This would let you answer:" with the real question, and an **expected impact** line ("High — could change 2 conclusions" / "Low — adds detail, changes nothing"). Upload control per card; optional items offer **Skip**. Adding a file updates the report and lands the product's defining moment, given full width and real weight on the page: the meter animating **71 → 89**, the component that moved, and the outcome in four expandable lines — new conclusions, changed conclusions, uncertainties resolved, gaps closed. Promotions are called out explicitly ("'APAC drove the decline' was inferred — it's now proven"), because watching a guess turn into a fact is the thing the user came for. If an upload lacks the needed field, the app says so plainly, names what it looked for, and keeps the item open.

**Screen 4 — Source drawer (advanced):** Reached from **Review sources** or any provenance marker. Data files show a column-level table (type, null %, distinct values, range, staleness). Documents show the extracted page with the figure highlighted in place and verify / dispute controls. Conflicts show both candidates side by side with provenance, a definition note, and a required reason. Compatibility mismatches show the two grains or units and the proposed reconciliation. Decision history for the item is always visible, so a reversal is never silent.

**Screen 5 — Share dialog:** Channel toggle between Email and Slack changes the fields — recipient chips and subject, or a channel picker. **Draft message** fills an editable body with a note that only report figures may appear. A preview shows exactly what recipients receive, including the PDF name and version. Pending decisions produce a blocking notice offering **Update first** or **Send this version anyway**. States: drafting, ready, sending, sent, failed (naming the channel error, keeping the edited text).

**Screen 6 — Version history:** Versions with timestamp, author, decisions applied and a one-line change summary. Selecting two renders a side-by-side diff of findings, confidence and open gaps. Any version is readable and exportable; older ones are read-only.

### Responsive behavior
| Screen / region | ~1440 wide | ~768 medium | ~320 narrow | Short height |
|---|---|---|---|---|
| Left rail | Pinned, three entries, New report primary | Collapses to icons, New report keeps its label | Becomes a bottom sheet; New report is a fixed button | Rail scrolls internally; header stays fixed |
| Create screen | Drop zone dominant, optional question and template picker on one row below | Question and template stack | Drop area becomes a button; question, template and file lines all stack | Generate pinned to the bottom edge |
| Claim class markers | Inline label at the end of the finding line | Label wraps to its own line under the finding | Label above the finding, dot-sized | Never truncated or hidden |
| Improve outcome | Meter and four outcome lines side by side, full width | Meter above, lines below | Fully stacked, deltas and promotions stay visible | Outcome block stays on screen after the update |
| Evidence strength + breakdown | Meter inline in the header, breakdown in a popover | Meter wraps below the title | Meter full width, breakdown opens as a sheet | Popover repositions and scrolls internally |
| Reading column | Centred, max ~72ch, chart full column width | Full width with side padding | Charts scroll horizontally inside their frame | Section headings stick while content scrolls |
| Recommendation block | Sentence with two inline buttons | Buttons wrap below the sentence | Buttons stack full width, accept on top | Block never splits across the fold |
| Pending-decisions bar | Sticky above the column, count plus Update report | Sticky, one line | Fixed to the bottom edge, action full width | Stays fixed, never covers the accept control |
| What you're missing | Three cards, Improve button below | Cards stack, button full width | Dot, title and impact on stacked lines | List scrolls locally, button stays reachable |
| Improve screen | Single column, upload inline per card | Same, full width | Upload control full width per card | Strength result stays visible after update |
| Evidence layer (on) | Confidence and provenance inline beside each finding | Provenance moves below the finding | Provenance collapses to a tappable marker | Adds height only; no nested scroll traps |
| Source drawer | Side drawer, ~480px | Half-height sheet | Full-screen sheet, page text scrolls | Sheet keeps its own scroll |
| Share dialog | Modal, form and preview side by side | Preview stacks below the form | Full-screen sheet, preview behind a toggle | Body scrolls, Send stays pinned |
| Version diff | Two columns side by side | Stacked, changes marked in both | One version with a toggle, changes flagged inline | Each column scrolls locally |
| Long tables / charts | Full width | Local horizontal overflow | Local overflow with an edge indicator | Never hide page overflow |

All states specified: skeleton frames while computing, plain progress ticks during generation, empty states that name the next action, and errors that state the cause and the recovery step.

## 7. Artifacts & references
- `data-profiling-and-quality-audit.skill.md` — Source Understanding Agent, and the compute contract
- `dataset-compatibility-check.skill.md` — Source Understanding Agent, the correctness gate on grain/units/period/definitions
- `document-evidence-extraction.skill.md` — Source Understanding Agent, PDF/DOCX figures and provenance
- `evidence-gap-analysis.skill.md` — Evidence Auditor Agent
- `actionable-gap-phrasing.skill.md` — Evidence Auditor Agent, turning every gap into an action with a named consequence
- `claim-classification.skill.md` — Insight Analyst Agent and the Coordinator's quality gate, proven / inferred / unknown
- `report-template-conformance.skill.md` — Report Architect Coordinator, writing into an uploaded house format
- `guided-conflict-recommendation.skill.md` — Evidence Auditor Agent, one recommendation per conflict
- `conflict-resolution-and-rerun.skill.md` — Evidence Auditor Agent and the Coordinator on update runs
- `five-question-report-narration.skill.md` — Insight Analyst Agent, plain-language adaptive structure
- `chart-necessity-test.skill.md` — Report Architect Coordinator, which findings earn a chart
- `premium-report-composition.skill.md` — Report Architect Coordinator
- `report-delivery-brief.skill.md` — Email and Slack Delivery Agents
- **App Mockup** design file — Create, Report and Improve screens plus key states; the build should follow it