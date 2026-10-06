CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" varchar(20);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "sets_search_trgm_idx" ON "study_sets" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sets_copied_from_idx" ON "study_sets" USING btree ("copied_from_id","created_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");