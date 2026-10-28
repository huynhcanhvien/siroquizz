ALTER TABLE "ai_aux_usage" ADD COLUMN "tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "tokens_reserved" integer DEFAULT 0 NOT NULL;