ALTER TABLE "ai_generation_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "jobs_status_id_idx" ON "ai_generation_jobs" USING btree ("status","id");