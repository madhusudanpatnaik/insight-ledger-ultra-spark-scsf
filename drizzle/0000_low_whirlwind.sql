CREATE TABLE "compatibility_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"dataset_a_id" text,
	"dataset_b_id" text,
	"axis" text NOT NULL,
	"verdict" text NOT NULL,
	"proposed_reconciliation" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"role" text DEFAULT 'source' NOT NULL,
	"row_count" integer,
	"column_count" integer,
	"page_count" integer,
	"grain" text,
	"period_start" text,
	"period_end" text,
	"units" text,
	"profile_json" jsonb,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"report_version" integer DEFAULT 1 NOT NULL,
	"channel" text NOT NULL,
	"recipients" jsonb,
	"message_body" text,
	"sent_by" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"error_detail" text,
	"sent_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"field_name" text NOT NULL,
	"plain_label" text NOT NULL,
	"action_phrase" text NOT NULL,
	"tier" text DEFAULT 'optional' NOT NULL,
	"why_it_matters" text,
	"unlocks_question" text,
	"explains_figure" text,
	"expected_impact" text DEFAULT 'low' NOT NULL,
	"conclusions_affected" integer DEFAULT 0 NOT NULL,
	"from_template" boolean DEFAULT false NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"label" text NOT NULL,
	"value_text" text NOT NULL,
	"period" text,
	"page_number" integer,
	"verified" boolean DEFAULT false NOT NULL,
	"conflicts_with" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"source_file" text DEFAULT '' NOT NULL,
	"structure_json" jsonb,
	"expected_metrics" jsonb,
	"times_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"question" text,
	"template_id" text,
	"dataset_ids" jsonb,
	"stats_pack" jsonb,
	"report_json" jsonb,
	"evidence_strength" integer DEFAULT 0 NOT NULL,
	"strength_components" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_report_id" text,
	"change_summary" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolutions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"action" text NOT NULL,
	"chosen_value" text,
	"reason" text,
	"basis" text,
	"decided_by" text,
	"applied_in_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "compatibility_checks_report_idx" ON "compatibility_checks" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "datasets_owner_idx" ON "datasets" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "deliveries_report_idx" ON "deliveries" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "evidence_gaps_report_idx" ON "evidence_gaps" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "extracted_facts_dataset_idx" ON "extracted_facts" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "report_messages_report_idx" ON "report_messages" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_templates_owner_idx" ON "report_templates" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "reports_owner_idx" ON "reports" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "resolutions_report_idx" ON "resolutions" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "_users_email_unique" ON "_users" USING btree ("email");