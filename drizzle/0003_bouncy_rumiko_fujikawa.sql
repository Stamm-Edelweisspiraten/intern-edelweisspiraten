CREATE TYPE "public"."share_target" AS ENUM('group', 'position', 'role', 'user');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"target_kind" "share_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"can_write" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_shares_unique" UNIQUE("folder_id","target_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"parent_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_shares" ADD CONSTRAINT "folder_shares_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_folder_idx" ON "documents" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "documents_file_idx" ON "documents" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "folder_shares_target_idx" ON "folder_shares" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "folders_name_idx" ON "folders" USING btree ("name");--> statement-breakpoint
CREATE INDEX "files_storage_key_idx" ON "files" USING btree ("storage_key");