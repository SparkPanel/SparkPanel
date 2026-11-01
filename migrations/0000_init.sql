CREATE TABLE "activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"size" bigint DEFAULT 0 NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "ddos_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar,
	"l3_enabled" boolean DEFAULT false NOT NULL,
	"l3_max_packets_per_second" integer,
	"l3_block_duration" integer,
	"l4_enabled" boolean DEFAULT false NOT NULL,
	"l4_max_connections_per_ip" integer,
	"l4_syn_flood_protection" boolean DEFAULT false NOT NULL,
	"l7_enabled" boolean DEFAULT false NOT NULL,
	"l7_max_requests_per_minute" integer,
	"l7_challenge_mode" boolean DEFAULT false NOT NULL,
	"l7_user_agent_blocking" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"ip" text NOT NULL,
	"port" integer DEFAULT 2375 NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"cpu_cores" integer NOT NULL,
	"ram_total" integer NOT NULL,
	"disk_total" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_settings" (
	"key" varchar PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_ports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" varchar NOT NULL,
	"port" integer NOT NULL,
	"protocol" text DEFAULT 'tcp' NOT NULL,
	"name" text,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"game_type" text NOT NULL,
	"node_id" varchar NOT NULL,
	"container_id" text,
	"status" text DEFAULT 'stopped' NOT NULL,
	"cpu_limit" integer NOT NULL,
	"ram_limit" integer NOT NULL,
	"disk_limit" integer NOT NULL,
	"port" integer NOT NULL,
	"auto_start" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"visibility" jsonb DEFAULT '{}'::jsonb,
	"limits" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sftp_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" varchar NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"home_directory" text DEFAULT '/data' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"nickname" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_server_ids" jsonb,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"access_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
