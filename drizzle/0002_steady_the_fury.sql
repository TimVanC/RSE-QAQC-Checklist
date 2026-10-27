CREATE TYPE "public"."call_outcome" AS ENUM('reached', 'no_answer', 'callback_later');--> statement-breakpoint
CREATE TABLE "call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_job_id" text NOT NULL,
	"call_date" date NOT NULL,
	"outcome" "call_outcome" NOT NULL,
	"note" text,
	"called_by" uuid,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_called_by_app_users_id_fk" FOREIGN KEY ("called_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_log_job_called_at_idx" ON "call_log" USING btree ("hcp_job_id","called_at");