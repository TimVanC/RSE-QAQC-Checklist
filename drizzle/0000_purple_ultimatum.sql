CREATE TYPE "public"."answer_source" AS ENUM('manual', 'auto_confirmed', 'auto_overridden');--> statement-breakpoint
CREATE TYPE "public"."answer_value" AS ENUM('Y', 'N', 'B');--> statement-breakpoint
CREATE TYPE "public"."checklist_status" AS ENUM('not_started', 'in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."checklist_type" AS ENUM('task', 'callback');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('HVAC', 'WATER HEATER', 'GENERATOR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('caller', 'manager', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('reconcile', 'backfill', 'webhook', 'manual', 'employees');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'processed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'caller' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "hcp_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_appointment_id" text NOT NULL,
	"hcp_job_id" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_date" date,
	"anytime" boolean DEFAULT false NOT NULL,
	"arrival_window_min" integer,
	"dispatched_employee_ids" text[] DEFAULT '{}' NOT NULL,
	"raw_json" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hcp_appointments_hcp_appointment_id_unique" UNIQUE("hcp_appointment_id")
);
--> statement-breakpoint
CREATE TABLE "hcp_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_customer_id" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"company" text,
	"email" text,
	"mobile" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"raw_json" jsonb NOT NULL,
	"hcp_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hcp_customers_hcp_customer_id_unique" UNIQUE("hcp_customer_id")
);
--> statement-breakpoint
CREATE TABLE "hcp_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_invoice_id" text NOT NULL,
	"hcp_job_id" text NOT NULL,
	"invoice_number" text,
	"status" text DEFAULT '' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"due_amount_cents" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"service_date" date,
	"raw_json" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hcp_invoices_hcp_invoice_id_unique" UNIQUE("hcp_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "hcp_job_assignees" (
	"hcp_job_id" text NOT NULL,
	"technician_id" uuid NOT NULL,
	CONSTRAINT "hcp_job_assignees_hcp_job_id_technician_id_pk" PRIMARY KEY("hcp_job_id","technician_id")
);
--> statement-breakpoint
CREATE TABLE "hcp_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_job_id" text NOT NULL,
	"invoice_number" text,
	"hcp_customer_id" text,
	"customer_name" text DEFAULT '' NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"address_city" text,
	"address_state" text,
	"address_zip" text,
	"address_formatted" text,
	"description" text,
	"job_type_name" text,
	"business_unit" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"lead_source" text,
	"work_status" text DEFAULT '' NOT NULL,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"arrival_window_min" integer,
	"hcp_time_zone" text,
	"on_my_way_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_amount_cents" integer,
	"outstanding_balance_cents" integer,
	"hcp_created_at" timestamp with time zone,
	"hcp_updated_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"raw_json" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hcp_jobs_hcp_job_id_unique" UNIQUE("hcp_job_id")
);
--> statement-breakpoint
CREATE TABLE "hcp_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_payment_id" text NOT NULL,
	"hcp_invoice_id" text NOT NULL,
	"hcp_job_id" text NOT NULL,
	"status" text,
	"payment_method" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"raw_json" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hcp_payments_hcp_payment_id_unique" UNIQUE("hcp_payment_id")
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_employee_id" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"mobile" text,
	"color_hex" text,
	"hcp_role" text,
	"is_technician" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"raw_json" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technicians_hcp_employee_id_unique" UNIQUE("hcp_employee_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_answers" (
	"checklist_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"value" "answer_value",
	"source" "answer_source" DEFAULT 'manual' NOT NULL,
	"auto_suggested_value" "answer_value",
	"auto_evidence" jsonb,
	"auto_computed_at" timestamp with time zone,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	CONSTRAINT "checklist_answers_checklist_id_step_key_pk" PRIMARY KEY("checklist_id","step_key")
);
--> statement-breakpoint
CREATE TABLE "checklist_scores" (
	"checklist_id" uuid PRIMARY KEY NOT NULL,
	"service_quote" smallint DEFAULT 0 NOT NULL,
	"in_progress" smallint DEFAULT 0 NOT NULL,
	"completed" smallint DEFAULT 0 NOT NULL,
	"fail_ops_check" smallint DEFAULT 0 NOT NULL,
	"fail_qaqc" smallint DEFAULT 0 NOT NULL,
	"fail_tool_control" smallint DEFAULT 0 NOT NULL,
	"fail_callback" smallint DEFAULT 0 NOT NULL,
	"total_failures" smallint DEFAULT 0 NOT NULL,
	"failures_value" smallint DEFAULT 0 NOT NULL,
	"bottom_line" smallint DEFAULT 4 NOT NULL,
	"perfect_task" smallint DEFAULT 0 NOT NULL,
	"completed_marks" smallint DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hcp_job_id" text NOT NULL,
	"hcp_appointment_id" text,
	"technician_id" uuid,
	"type" "checklist_type" NOT NULL,
	"parent_checklist_id" uuid,
	"config_version" integer DEFAULT 1 NOT NULL,
	"call_date" date NOT NULL,
	"status" "checklist_status" DEFAULT 'in_progress' NOT NULL,
	"project_type" "project_type",
	"customer_name" text DEFAULT '' NOT NULL,
	"project_location" text DEFAULT '' NOT NULL,
	"project_date" date,
	"referral_project_no" text DEFAULT '' NOT NULL,
	"permit_submitted_on" date,
	"permit_followup_on" date,
	"permit_approved_on" date,
	"parts_received_on" date,
	"parts_order_no" text,
	"notes" text,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"reopened_by" uuid,
	"reopened_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklists_callback_has_parent" CHECK ("checklists"."type" = 'task' OR "checklists"."parent_checklist_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_periods_start_date_unique" UNIQUE("start_date"),
	CONSTRAINT "pay_periods_end_after_start" CHECK ("pay_periods"."end_date" >= "pay_periods"."start_date")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"started_by" uuid
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"hcp_entity_id" text,
	"occurred_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "webhook_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "hcp_appointments" ADD CONSTRAINT "hcp_appointments_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hcp_invoices" ADD CONSTRAINT "hcp_invoices_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hcp_job_assignees" ADD CONSTRAINT "hcp_job_assignees_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hcp_job_assignees" ADD CONSTRAINT "hcp_job_assignees_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hcp_jobs" ADD CONSTRAINT "hcp_jobs_hcp_customer_id_hcp_customers_hcp_customer_id_fk" FOREIGN KEY ("hcp_customer_id") REFERENCES "public"."hcp_customers"("hcp_customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hcp_payments" ADD CONSTRAINT "hcp_payments_hcp_invoice_id_hcp_invoices_hcp_invoice_id_fk" FOREIGN KEY ("hcp_invoice_id") REFERENCES "public"."hcp_invoices"("hcp_invoice_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hcp_payments" ADD CONSTRAINT "hcp_payments_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_answered_by_app_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_scores" ADD CONSTRAINT "checklist_scores_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_parent_checklist_id_checklists_id_fk" FOREIGN KEY ("parent_checklist_id") REFERENCES "public"."checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_submitted_by_app_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_reopened_by_app_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_app_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_started_by_app_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hcp_appointments_job_idx" ON "hcp_appointments" USING btree ("hcp_job_id");--> statement-breakpoint
CREATE INDEX "hcp_appointments_start_idx" ON "hcp_appointments" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "hcp_invoices_job_idx" ON "hcp_invoices" USING btree ("hcp_job_id");--> statement-breakpoint
CREATE INDEX "hcp_job_assignees_tech_idx" ON "hcp_job_assignees" USING btree ("technician_id");--> statement-breakpoint
CREATE INDEX "hcp_jobs_scheduled_start_idx" ON "hcp_jobs" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "hcp_jobs_work_status_idx" ON "hcp_jobs" USING btree ("work_status");--> statement-breakpoint
CREATE INDEX "hcp_jobs_hcp_updated_at_idx" ON "hcp_jobs" USING btree ("hcp_updated_at");--> statement-breakpoint
CREATE INDEX "hcp_jobs_customer_idx" ON "hcp_jobs" USING btree ("hcp_customer_id");--> statement-breakpoint
CREATE INDEX "hcp_payments_job_idx" ON "hcp_payments" USING btree ("hcp_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklists_one_task_per_job" ON "checklists" USING btree ("hcp_job_id") WHERE "checklists"."type" = 'task';--> statement-breakpoint
CREATE INDEX "checklists_technician_date_idx" ON "checklists" USING btree ("technician_id","call_date");--> statement-breakpoint
CREATE INDEX "checklists_status_idx" ON "checklists" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checklists_parent_idx" ON "checklists" USING btree ("parent_checklist_id");--> statement-breakpoint
CREATE INDEX "checklists_job_idx" ON "checklists" USING btree ("hcp_job_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status","received_at");