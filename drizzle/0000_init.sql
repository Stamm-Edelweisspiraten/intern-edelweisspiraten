CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'invited');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('parent', 'child');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('sippe', 'meute');--> statement-breakpoint
CREATE TYPE "public"."member_file_kind" AS ENUM('consent', 'application');--> statement-breakpoint
CREATE TYPE "public"."member_log_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."position_type" AS ENUM('amt', 'gruppenleiter');--> statement-breakpoint
CREATE TYPE "public"."account_sphere" AS ENUM('ideell', 'vermoegensverwaltung', 'zweckbetrieb', 'wirtschaftlich', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."attachment_target" AS ENUM('entry', 'invoice', 'bill', 'payment');--> statement-breakpoint
CREATE TYPE "public"."finance_log_action" AS ENUM('create', 'update', 'delete', 'pay', 'cancel', 'reverse', 'archive', 'close');--> statement-breakpoint
CREATE TYPE "public"."finance_log_entity" AS ENUM('journalEntry', 'invoice', 'bill', 'payment', 'account', 'fiscalYear', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."fiscal_year_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'partial', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."journal_source" AS ENUM('manual', 'invoice', 'payment', 'order', 'recurring', 'import', 'opening', 'closing');--> statement-breakpoint
CREATE TYPE "public"."reconcile_status" AS ENUM('open', 'matched', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."recurring_interval" AS ENUM('monthly', 'quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('open', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('ordered', 'processing', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_kind" AS ENUM('in', 'out', 'correction', 'order', 'return');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"require_mfa" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"device" text,
	"ip" text,
	"revoked_at" timestamp with time zone,
	"mfa_satisfied" boolean DEFAULT false NOT NULL,
	"impersonation_user_id" uuid,
	"impersonation_user_name" text,
	"impersonation_user_email" text,
	"impersonation_started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_members" (
	"user_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "user_members_user_id_member_id_pk" PRIMARY KEY("user_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"password_changed_at" timestamp with time zone,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"type" "user_type" DEFAULT 'parent' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"mfa_recovery_codes" text[],
	"mfa_confirmed_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" DEFAULT 'sippe' NOT NULL,
	"meeting_time" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reply_to" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_groups" (
	"member_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "member_groups_member_id_group_id_pk" PRIMARY KEY("member_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "member_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"action" "member_log_action" NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_phones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"number" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firstname" text NOT NULL,
	"lastname" text NOT NULL,
	"fahrtenname" text DEFAULT '' NOT NULL,
	"birthday" text DEFAULT '' NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"stand" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'aktiv' NOT NULL,
	"entry_date" text DEFAULT '' NOT NULL,
	"is_second_member" boolean DEFAULT false NOT NULL,
	"dues_stamm" boolean DEFAULT true NOT NULL,
	"dues_gau" boolean DEFAULT true NOT NULL,
	"dues_landesmark" boolean DEFAULT true NOT NULL,
	"dues_bund" boolean DEFAULT true NOT NULL,
	"consent_social_media" boolean DEFAULT false NOT NULL,
	"consent_website" boolean DEFAULT false NOT NULL,
	"consent_print" boolean DEFAULT false NOT NULL,
	"consent_file_id" uuid,
	"application_file_id" uuid,
	"invite_code" text,
	"invite_code_issued_at" timestamp with time zone,
	"invite_code_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_members" (
	"position_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "position_members_position_id_member_id_pk" PRIMARY KEY("position_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "position_type" DEFAULT 'amt' NOT NULL,
	"group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"sphere" "account_sphere" DEFAULT 'ideell' NOT NULL,
	"parent_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_bank" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target" "attachment_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid NOT NULL,
	"account_holder" text DEFAULT '' NOT NULL,
	"iban" text DEFAULT '' NOT NULL,
	"bic" text DEFAULT '' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"is_cash" boolean DEFAULT false NOT NULL,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_import_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"counterparty" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "reconcile_status" DEFAULT 'open' NOT NULL,
	"matched_entry_id" uuid,
	"matched_at" timestamp with time zone,
	"matched_by" text
);
--> statement-breakpoint
CREATE TABLE "bank_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"imported_by" text DEFAULT 'system' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"kind" text DEFAULT 'Sonstiges' NOT NULL,
	"category_id" uuid,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"note" text DEFAULT '' NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"entry_id" uuid,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "bills_amount_check" CHECK ("bills"."amount" > 0),
	CONSTRAINT "bills_paid_check" CHECK ("bills"."paid_amount" >= 0 and "bills"."paid_amount" <= "bills"."amount")
);
--> statement-breakpoint
CREATE TABLE "booking_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"account_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_categories_direction_check" CHECK ("booking_categories"."direction" in ('in', 'out'))
);
--> statement-breakpoint
CREATE TABLE "finance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year_id" uuid,
	"entity" "finance_log_entity" NOT NULL,
	"entity_id" uuid,
	"action" "finance_log_action" NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"dues_stamm" integer DEFAULT 0 NOT NULL,
	"dues_gau" integer DEFAULT 0 NOT NULL,
	"dues_landesmark" integer DEFAULT 0 NOT NULL,
	"dues_bund" integer DEFAULT 0 NOT NULL,
	"status" "fiscal_year_status" DEFAULT 'active' NOT NULL,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"member_id" uuid,
	"member_name" text,
	"kind" text DEFAULT 'Sonstiges' NOT NULL,
	"category_id" uuid,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"note" text DEFAULT '' NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"order_id" uuid,
	"entry_id" uuid,
	"reminded_at" timestamp with time zone,
	"reminder_level" integer DEFAULT 0 NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "invoices_amount_check" CHECK ("invoices"."amount" > 0),
	CONSTRAINT "invoices_paid_check" CHECK ("invoices"."paid_amount" >= 0 and "invoices"."paid_amount" <= "invoices"."amount")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_no" text NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" "journal_source" DEFAULT 'manual' NOT NULL,
	"reverses_id" uuid,
	"reversed_by_id" uuid,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"member_id" uuid,
	"member_name" text,
	"bank_account_id" uuid,
	"category_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "journal_lines_amounts_check" CHECK ("journal_lines"."debit" >= 0 and "journal_lines"."credit" >= 0),
	CONSTRAINT "journal_lines_side_check" CHECK (("journal_lines"."debit" = 0) <> ("journal_lines"."credit" = 0))
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"key" text PRIMARY KEY NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"bill_id" uuid,
	"bank_account_id" uuid NOT NULL,
	"entry_id" uuid,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_target_check" CHECK (("payments"."invoice_id" is null) <> ("payments"."bill_id" is null))
);
--> statement-breakpoint
CREATE TABLE "recurring_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"interval" "recurring_interval" DEFAULT 'monthly' NOT NULL,
	"amount" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"member_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_run_at" date NOT NULL,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_amount_check" CHECK ("recurring_schedules"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "article_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"order_url" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"order_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_invoices" (
	"order_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	CONSTRAINT "order_invoices_order_id_invoice_id_pk" PRIMARY KEY("order_id","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"article_id" uuid,
	"size_id" uuid,
	"name" text NOT NULL,
	"size" text,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"total" integer NOT NULL,
	"received" boolean DEFAULT false NOT NULL,
	"stock_booked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_members" (
	"order_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"member_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "order_members_order_id_member_id_pk" PRIMARY KEY("order_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"status" "order_status" DEFAULT 'ordered' NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'open' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"size_id" uuid,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"order_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_members" ADD CONSTRAINT "user_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_emails" ADD CONSTRAINT "member_emails_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_phones" ADD CONSTRAINT "member_phones_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_consent_file_id_files_id_fk" FOREIGN KEY ("consent_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_application_file_id_files_id_fk" FOREIGN KEY ("application_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_members" ADD CONSTRAINT "position_members_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_members" ADD CONSTRAINT "position_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_import_lines" ADD CONSTRAINT "bank_import_lines_import_id_bank_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_import_lines" ADD CONSTRAINT "bank_import_lines_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_import_lines" ADD CONSTRAINT "bank_import_lines_matched_entry_id_journal_entries_id_fk" FOREIGN KEY ("matched_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_booking_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."booking_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_categories" ADD CONSTRAINT "booking_categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_category_id_booking_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."booking_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_category_id_booking_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."booking_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_category_id_booking_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."booking_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_sizes" ADD CONSTRAINT "article_sizes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_size_id_article_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."article_sizes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_members" ADD CONSTRAINT "order_members_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_members" ADD CONSTRAINT "order_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_size_id_article_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."article_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_unique" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_attempts_expires_idx" ON "login_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_unique" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_members_member_idx" ON "user_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "groups_name_idx" ON "groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "member_emails_member_idx" ON "member_emails" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "member_emails_email_idx" ON "member_emails" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_groups_group_idx" ON "member_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "member_logs_member_idx" ON "member_logs" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "member_phones_member_idx" ON "member_phones" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_invite_code_unique" ON "members" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "members_name_idx" ON "members" USING btree ("lastname","firstname");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "position_members_member_idx" ON "position_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "positions_type_idx" ON "positions" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_number_unique" ON "accounts" USING btree ("number");--> statement-breakpoint
CREATE INDEX "accounts_type_idx" ON "accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "attachments_target_idx" ON "attachments" USING btree ("target","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_account_unique" ON "bank_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_import_lines_fingerprint_unique" ON "bank_import_lines" USING btree ("bank_account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "bank_import_lines_status_idx" ON "bank_import_lines" USING btree ("bank_account_id","status");--> statement-breakpoint
CREATE INDEX "bank_imports_account_idx" ON "bank_imports" USING btree ("bank_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_number_unique" ON "bills" USING btree ("number");--> statement-breakpoint
CREATE INDEX "bills_year_status_idx" ON "bills" USING btree ("fiscal_year_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_categories_name_unique" ON "booking_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "finance_logs_year_idx" ON "finance_logs" USING btree ("fiscal_year_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_years_year_unique" ON "fiscal_years" USING btree ("year");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_year_status_idx" ON "invoices" USING btree ("fiscal_year_id","status");--> statement-breakpoint
CREATE INDEX "invoices_member_idx" ON "invoices" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_year_member_kind_unique" ON "invoices" USING btree ("fiscal_year_id","member_id","kind") WHERE member_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_no_unique" ON "journal_entries" USING btree ("entry_no");--> statement-breakpoint
CREATE INDEX "journal_entries_year_idx" ON "journal_entries" USING btree ("fiscal_year_id","date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_member_idx" ON "journal_lines" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "journal_lines_bank_idx" ON "journal_lines" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_bill_idx" ON "payments" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "recurring_next_run_idx" ON "recurring_schedules" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "article_sizes_unique" ON "article_sizes" USING btree ("article_id","name");--> statement-breakpoint
CREATE INDEX "article_sizes_article_idx" ON "article_sizes" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "articles_active_name_idx" ON "articles" USING btree ("active","name");--> statement-breakpoint
CREATE INDEX "order_invoices_invoice_idx" ON "order_invoices" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_members_member_idx" ON "order_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_movements_article_idx" ON "stock_movements" USING btree ("article_id","created_at");