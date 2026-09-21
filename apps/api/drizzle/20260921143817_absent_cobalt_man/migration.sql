CREATE TABLE "requests" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"note" text,
	"user_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_type_check" CHECK ("type" IN ('signup', 'reset_password')),
	CONSTRAINT "requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_requests_open" ON "requests" ("email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_requests_status" ON "requests" ("status");--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_decided_by_users_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL;