ALTER TABLE "users" ADD COLUMN "two_factor_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;