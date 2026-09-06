ALTER TABLE "survey_answers" ADD COLUMN "other_value" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_fields" ADD COLUMN "allow_other" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_fields" ADD COLUMN "min_value" integer;--> statement-breakpoint
ALTER TABLE "survey_fields" ADD COLUMN "max_value" integer;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "source" text DEFAULT 'intern' NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "public_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "public_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "public_token_hash" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "public_name_mode" text DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "public_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_public_token_unique" UNIQUE("public_token_hash");