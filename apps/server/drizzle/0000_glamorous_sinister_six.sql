CREATE TABLE "agent_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"address" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"owner_address" text,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"character_id" text NOT NULL,
	"image_uri" text NOT NULL,
	"strategy_id" text NOT NULL,
	"strategy_name" text NOT NULL,
	"strategy_config" jsonb NOT NULL,
	"instructions" text,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"starting_balance" double precision NOT NULL,
	"cash_balance" double precision NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"trades_count" integer DEFAULT 0 NOT NULL,
	"last_tick_at" timestamp with time zone,
	"last_decision_at" timestamp with time zone,
	"last_entry_at" timestamp with time zone,
	"last_error" text,
	"launch_id" text,
	"token_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"purpose" text NOT NULL,
	"message" text NOT NULL,
	"scope" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "burns" (
	"id" text PRIMARY KEY NOT NULL,
	"usd_spent" double precision NOT NULL,
	"amount_burned" double precision NOT NULL,
	"tx_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"action" text NOT NULL,
	"chain" text,
	"token_address" text,
	"symbol" text,
	"reason" text NOT NULL,
	"outcome" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equity_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"value" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"author_type" text NOT NULL,
	"author_name" text NOT NULL,
	"author_address" text,
	"character_id" text,
	"body" text NOT NULL,
	"reply_to_id" text,
	"token_chain" text,
	"token_address" text,
	"token_symbol" text,
	"token_name" text,
	"token_snapshot" jsonb,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launches" (
	"id" text PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"token_address" text NOT NULL,
	"curve_address" text,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_uri" text,
	"website" text,
	"twitter" text,
	"pair_token" text NOT NULL,
	"pair_symbol" text NOT NULL,
	"creator_wallet" text NOT NULL,
	"with_agent" boolean DEFAULT false NOT NULL,
	"agent_id" text,
	"tx_hash" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"pin_order" integer DEFAULT 0 NOT NULL,
	"launched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"chain" text NOT NULL,
	"token_address" text NOT NULL,
	"pair_address" text,
	"symbol" text NOT NULL,
	"name" text,
	"quantity" double precision NOT NULL,
	"cost_value" double precision NOT NULL,
	"entry_price_usd" double precision NOT NULL,
	"last_price_usd" double precision NOT NULL,
	"last_value" double precision NOT NULL,
	"peak_value" double precision NOT NULL,
	"status" text NOT NULL,
	"exit_reason" text,
	"realized_pnl" double precision,
	"mode" text NOT NULL,
	"raw_quantity" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"position_id" text,
	"side" text NOT NULL,
	"chain" text NOT NULL,
	"token_address" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" double precision NOT NULL,
	"value" double precision NOT NULL,
	"price_usd" double precision NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"tx_hash" text,
	"reason" text NOT NULL,
	"pnl" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"address" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"chain" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" text NOT NULL,
	"tx_hash" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_wallets" ADD CONSTRAINT "agent_wallets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_snapshots" ADD CONSTRAINT "equity_snapshots_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallets_agent_kind_idx" ON "agent_wallets" USING btree ("agent_id","kind");--> statement-breakpoint
CREATE INDEX "agents_owner_idx" ON "agents" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "decisions_agent_idx" ON "decisions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "decisions_created_idx" ON "decisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "equity_agent_idx" ON "equity_snapshots" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "floor_created_idx" ON "floor_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "launches_token_idx" ON "launches" USING btree ("chain","token_address");--> statement-breakpoint
CREATE INDEX "positions_agent_status_idx" ON "positions" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "trades_agent_idx" ON "trades" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "trades_created_idx" ON "trades" USING btree ("created_at");