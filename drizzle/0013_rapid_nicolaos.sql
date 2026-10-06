CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"set_id" uuid NOT NULL,
	"game" "game_kind" NOT NULL,
	"seed" integer NOT NULL,
	"answer_side" varchar(10) DEFAULT 'term' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"verified" boolean DEFAULT false NOT NULL,
	"score" integer,
	"time_ms" integer,
	"rejected_reason" varchar(20)
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_sessions_board_idx" ON "game_sessions" USING btree ("set_id","game","verified");--> statement-breakpoint
CREATE INDEX "game_sessions_user_idx" ON "game_sessions" USING btree ("user_id","started_at");