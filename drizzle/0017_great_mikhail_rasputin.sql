CREATE TYPE "public"."change_request_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."collab_principal" AS ENUM('user', 'class_teachers');--> statement-breakpoint
CREATE TYPE "public"."library_audience" AS ENUM('teachers', 'class');--> statement-breakpoint
CREATE TYPE "public"."library_item_type" AS ENUM('set', 'folder');--> statement-breakpoint
CREATE TABLE "class_library_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"class_id" uuid NOT NULL,
	"item_type" "library_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"shared_by" text NOT NULL,
	"audience" "library_audience" DEFAULT 'class' NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"set_id" uuid NOT NULL,
	"class_id" uuid,
	"author_id" text NOT NULL,
	"status" "change_request_status" DEFAULT 'pending' NOT NULL,
	"ops" jsonb NOT NULL,
	"base_updated_at" timestamp with time zone NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"review_note" varchar(500) DEFAULT '' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_collaborators" (
	"set_id" uuid NOT NULL,
	"principal_type" "collab_principal" NOT NULL,
	"principal_id" text NOT NULL,
	"granted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_collaborators_set_id_principal_type_principal_id_pk" PRIMARY KEY("set_id","principal_type","principal_id")
);
--> statement-breakpoint
ALTER TABLE "study_sets" ADD COLUMN "accepts_contributions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "class_library_items" ADD CONSTRAINT "class_library_items_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_library_items" ADD CONSTRAINT "class_library_items_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_change_requests" ADD CONSTRAINT "set_change_requests_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_change_requests" ADD CONSTRAINT "set_change_requests_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_change_requests" ADD CONSTRAINT "set_change_requests_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_change_requests" ADD CONSTRAINT "set_change_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_collaborators" ADD CONSTRAINT "set_collaborators_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_collaborators" ADD CONSTRAINT "set_collaborators_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_library_once_idx" ON "class_library_items" USING btree ("class_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "class_library_item_idx" ON "class_library_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "change_requests_set_status_idx" ON "set_change_requests" USING btree ("set_id","status","created_at");--> statement-breakpoint
CREATE INDEX "change_requests_author_idx" ON "set_change_requests" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "set_collab_principal_idx" ON "set_collaborators" USING btree ("principal_type","principal_id");