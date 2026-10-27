CREATE TYPE "public"."action_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"description" text NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"due_date" date,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_resolved_by_app_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrective_actions_checklist_idx" ON "corrective_actions" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "corrective_actions_status_due_idx" ON "corrective_actions" USING btree ("status","due_date");