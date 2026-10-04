CREATE TABLE "card_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"alt" varchar(1000) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_images_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "card_stars" (
	"user_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	CONSTRAINT "card_stars_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"mode" varchar(24) NOT NULL,
	"duration_ms" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"was_new" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_freezes" (
	"user_id" text NOT NULL,
	"day" varchar(10) NOT NULL,
	"week" varchar(10) NOT NULL,
	CONSTRAINT "streak_freezes_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"set_id" uuid,
	"mode" varchar(24) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cards_seen" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"incorrect" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"new_cards_per_day" integer DEFAULT 20 NOT NULL,
	"retention" double precision DEFAULT 0.9 NOT NULL,
	"time_zone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"goal_type" varchar(12) DEFAULT 'cards' NOT NULL,
	"goal" integer DEFAULT 20 NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_hour" integer DEFAULT 19 NOT NULL,
	"reminder_sent_day" varchar(10),
	"push_enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "due" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "stability" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "difficulty" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "elapsed_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "scheduled_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "learning_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "reps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "lapses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "state" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_progress" ADD COLUMN "last_review" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_images" ADD CONSTRAINT "card_images_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_images" ADD CONSTRAINT "card_images_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_stars" ADD CONSTRAINT "card_stars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_stars" ADD CONSTRAINT "card_stars_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_image_card_idx" ON "card_images" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "review_user_time_idx" ON "review_logs" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "freeze_user_week_idx" ON "streak_freezes" USING btree ("user_id","week");--> statement-breakpoint
CREATE INDEX "session_study_user_time_idx" ON "study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "progress_user_due_idx" ON "card_progress" USING btree ("user_id","due");