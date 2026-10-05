CREATE TYPE "public"."class_role" AS ENUM('owner', 'teacher', 'student');--> statement-breakpoint
CREATE TABLE "class_members" (
	"class_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "class_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_members_class_id_user_id_pk" PRIMARY KEY("class_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "class_sets" (
	"class_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"assigned_by" text,
	"due_at" timestamp with time zone,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_sets_class_id_set_id_pk" PRIMARY KEY("class_id","set_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"join_code" varchar(6) NOT NULL,
	"join_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sets" ADD CONSTRAINT "class_sets_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sets" ADD CONSTRAINT "class_sets_set_id_study_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."study_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sets" ADD CONSTRAINT "class_sets_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_members_user_idx" ON "class_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "class_sets_set_idx" ON "class_sets" USING btree ("set_id");