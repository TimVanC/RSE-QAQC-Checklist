CREATE TYPE "public"."technician_role" AS ENUM('lead', 'assistant');--> statement-breakpoint
CREATE TABLE "job_roles" (
	"hcp_job_id" text NOT NULL,
	"technician_id" uuid NOT NULL,
	"role" "technician_role" NOT NULL,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_roles_hcp_job_id_technician_id_pk" PRIMARY KEY("hcp_job_id","technician_id")
);
--> statement-breakpoint
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_hcp_job_id_hcp_jobs_hcp_job_id_fk" FOREIGN KEY ("hcp_job_id") REFERENCES "public"."hcp_jobs"("hcp_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_set_by_app_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;