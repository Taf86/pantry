CREATE TABLE "signup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"contact" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_requests_status_check" CHECK ("signup_requests"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_signup_requests_open" ON "signup_requests" USING btree ("email") WHERE "signup_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_signup_requests_queue" ON "signup_requests" USING btree ("status","created_at");