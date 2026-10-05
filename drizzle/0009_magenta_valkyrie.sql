CREATE TYPE "public"."moderation_status" AS ENUM('none', 'pending', 'approved', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."set_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" varchar(40) NOT NULL,
	"target_type" varchar(8) NOT NULL,
	"target_id" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" varchar(8) NOT NULL,
	"target_id" text NOT NULL,
	"reason" varchar(16) NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"handled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "visibility" "set_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "slug" varchar(10);--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "copied_from_id" uuid;--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "moderation_status" "moderation_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "moderation_reason" varchar(200);--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" varchar(16) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_once_idx" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "sets_moderation_idx" ON "study_sets" USING btree ("moderation_status","updated_at");--> statement-breakpoint
ALTER TABLE "study_sets" ADD CONSTRAINT "study_sets_slug_unique" UNIQUE("slug");