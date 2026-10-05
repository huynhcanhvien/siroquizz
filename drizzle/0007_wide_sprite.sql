ALTER TABLE "ai_generation_jobs" ADD COLUMN "step_lease" text;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "step_lease_until" timestamp with time zone;