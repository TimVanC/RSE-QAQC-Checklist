ALTER TABLE "app_users" DROP CONSTRAINT "app_users_email_unique";--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_live_uq" ON "app_users" USING btree ("email") WHERE "app_users"."deleted_at" is null;