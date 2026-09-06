CREATE TYPE "public"."event_response" AS ENUM('yes', 'no', 'maybe');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TABLE "calendar_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_tokens_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "event_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"response" "event_response" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_responses_unique" UNIQUE("event_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "event_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"target_kind" "share_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_shares_unique" UNIQUE("event_id","target_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"response_deadline" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_shares" ADD CONSTRAINT "event_shares_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_tokens_user_idx" ON "calendar_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_responses_event_idx" ON "event_responses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_shares_target_idx" ON "event_shares" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");