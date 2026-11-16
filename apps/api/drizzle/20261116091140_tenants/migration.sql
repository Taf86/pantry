CREATE TABLE "tenants" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"main" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_main" ON "tenants" ("main") WHERE "main";--> statement-breakpoint
INSERT INTO "tenants" ("id", "name", "main") VALUES (gen_random_uuid()::text, 'Main', true);--> statement-breakpoint
ALTER TABLE "list_members" DROP CONSTRAINT "list_members_list_id_lists_id_fkey";--> statement-breakpoint
ALTER TABLE "list_members" DROP CONSTRAINT "list_members_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "lists" DROP CONSTRAINT "lists_created_by_users_id_fkey";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "list_members" ADD COLUMN "tenant_id" text;--> statement-breakpoint
UPDATE "users" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "main");--> statement-breakpoint
UPDATE "lists" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "main");--> statement-breakpoint
UPDATE "list_members" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "main");--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "list_members" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_id_tenant_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_list_members_tenant" ON "list_members" ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_lists_tenant" ON "lists" ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" ("tenant_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_tenant_users_fkey" FOREIGN KEY ("created_by","tenant_id") REFERENCES "users"("id","tenant_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_tenant_lists_fkey" FOREIGN KEY ("list_id","tenant_id") REFERENCES "lists"("id","tenant_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_tenant_users_fkey" FOREIGN KEY ("user_id","tenant_id") REFERENCES "users"("id","tenant_id") ON DELETE CASCADE;
