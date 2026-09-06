ALTER TABLE "compatibility_checks" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_gaps" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "report_messages" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "compatibility_checks_owner_idx" ON "compatibility_checks" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "deliveries_owner_idx" ON "deliveries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "evidence_gaps_owner_idx" ON "evidence_gaps" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "extracted_facts_owner_idx" ON "extracted_facts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "report_messages_owner_idx" ON "report_messages" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "resolutions_owner_idx" ON "resolutions" USING btree ("owner_user_id");