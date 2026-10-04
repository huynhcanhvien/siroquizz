CREATE TABLE "ai_aux_usage" (
	"user_id" text NOT NULL,
	"day" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_aux_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "ai_generation_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"prompt" varchar(1000) NOT NULL,
	"options" jsonb NOT NULL,
	"upload_ids" jsonb NOT NULL,
	"result" jsonb,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" text DEFAULT '0' NOT NULL,
	"error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"mime" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_uploads_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "ai_aux_usage" ADD CONSTRAINT "ai_aux_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_uploads" ADD CONSTRAINT "ai_uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_user_created_idx" ON "ai_generation_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_expiry_idx" ON "ai_uploads" USING btree ("expires_at");