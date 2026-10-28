CREATE TYPE "public"."writing_peer_visibility" AS ENUM('hidden', 'open');--> statement-breakpoint
CREATE TYPE "public"."writing_session_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "scratch_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"term" varchar(1000) NOT NULL,
	"definition" varchar(1000) DEFAULT '' NOT NULL,
	"phonetic" varchar(200),
	"example" varchar(1000),
	"source_doc_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_docs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"state" "bytea",
	"version" integer DEFAULT 0 NOT NULL,
	"text_preview" varchar(300) DEFAULT '' NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"last_editor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"class_id" uuid NOT NULL,
	"created_by" text,
	"title" varchar(120) NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"status" "writing_session_status" DEFAULT 'draft' NOT NULL,
	"peer_visibility" "writing_peer_visibility" DEFAULT 'hidden' NOT NULL,
	"peer_editing" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scratch_cards" ADD CONSTRAINT "scratch_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scratch_cards" ADD CONSTRAINT "scratch_cards_source_doc_id_writing_docs_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."writing_docs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_docs" ADD CONSTRAINT "writing_docs_session_id_writing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."writing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_docs" ADD CONSTRAINT "writing_docs_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_docs" ADD CONSTRAINT "writing_docs_last_editor_id_user_id_fk" FOREIGN KEY ("last_editor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_sessions" ADD CONSTRAINT "writing_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_sessions" ADD CONSTRAINT "writing_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scratch_cards_user_idx" ON "scratch_cards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "writing_docs_author_idx" ON "writing_docs" USING btree ("session_id","author_id");--> statement-breakpoint
CREATE INDEX "writing_docs_session_updated_idx" ON "writing_docs" USING btree ("session_id","updated_at");--> statement-breakpoint
CREATE INDEX "writing_sessions_class_idx" ON "writing_sessions" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX "writing_sessions_closed_idx" ON "writing_sessions" USING btree ("status","closed_at");