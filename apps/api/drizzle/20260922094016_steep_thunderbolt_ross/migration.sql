CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "requester_hash" text;--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_requests_requester" ON "requests" ("requester_hash") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;