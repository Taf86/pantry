CREATE TABLE "applied_mutations" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" text,
	"user_id" text,
	"permissions" integer DEFAULT 1 NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_pkey" PRIMARY KEY("list_id","user_id"),
	CONSTRAINT "list_members_permissions_check" CHECK (("permissions" & 1) = 1 AND ("permissions" | 15) = 15)
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_applied_mutations_cleanup" ON "applied_mutations" ("applied_at");--> statement-breakpoint
CREATE INDEX "idx_list_members_user" ON "list_members" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_lists_created_by" ON "lists" ("created_by");--> statement-breakpoint
ALTER TABLE "applied_mutations" ADD CONSTRAINT "applied_mutations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;