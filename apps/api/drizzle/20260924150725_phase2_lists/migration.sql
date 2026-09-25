CREATE TABLE "applied_mutations" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY,
	"slug" text UNIQUE,
	"name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_label_check" CHECK (("slug" IS NOT NULL AND "name" IS NULL)
       OR ("slug" IS NULL AND "name" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" text PRIMARY KEY,
	"list_id" text NOT NULL,
	"raw_text" text NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric,
	"unit" text,
	"unit_text" text,
	"note" text,
	"category_id" text,
	"product_id" text,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"checked_in" text,
	"check_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "list_items_unit_exclusive_check" CHECK ("unit" IS NULL OR "unit_text" IS NULL),
	CONSTRAINT "list_items_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 0),
	CONSTRAINT "list_items_checked_check" CHECK (("checked_at" IS NULL) = ("checked_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" text,
	"user_id" text,
	"permissions" integer DEFAULT 1 NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_pkey" PRIMARY KEY("list_id","user_id"),
	CONSTRAINT "list_members_permissions_check" CHECK (("permissions" | 15) = 15)
);
--> statement-breakpoint
CREATE TABLE "list_products" (
	"list_id" text,
	"product_id" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_quantity" numeric,
	"last_unit" text,
	"last_unit_text" text,
	"category_id" text,
	CONSTRAINT "list_products_pkey" PRIMARY KEY("list_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY,
	"normalized_name" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"category_id" text,
	"default_unit" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_sessions" (
	"id" text PRIMARY KEY,
	"list_id" text NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "shopping_sessions_end_reason_check" CHECK ("end_reason" IS NULL OR "end_reason" IN ('released', 'completed', 'taken_over', 'expired', 'list_deleted')),
	CONSTRAINT "shopping_sessions_ended_check" CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "idx_applied_mutations_cleanup" ON "applied_mutations" ("applied_at");--> statement-breakpoint
CREATE INDEX "idx_categories_order" ON "categories" ("sort_order","id");--> statement-breakpoint
CREATE INDEX "idx_list_items_list" ON "list_items" ("list_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_list_items_sync" ON "list_items" ("list_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_list_items_session" ON "list_items" ("checked_in") WHERE "checked_in" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_list_items_product" ON "list_items" ("product_id");--> statement-breakpoint
CREATE INDEX "idx_list_members_user" ON "list_members" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_list_products_suggest" ON "list_products" ("list_id","use_count");--> statement-breakpoint
CREATE INDEX "idx_list_products_recent" ON "list_products" ("list_id","last_used_at");--> statement-breakpoint
CREATE INDEX "idx_lists_created_by" ON "lists" ("created_by");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shopping_sessions_active" ON "shopping_sessions" ("list_id") WHERE "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_shopping_sessions_expiry" ON "shopping_sessions" ("expires_at") WHERE "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_shopping_sessions_list" ON "shopping_sessions" ("list_id","started_at");--> statement-breakpoint
ALTER TABLE "applied_mutations" ADD CONSTRAINT "applied_mutations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_checked_by_users_id_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_checked_in_shopping_sessions_id_fkey" FOREIGN KEY ("checked_in") REFERENCES "shopping_sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "list_products" ADD CONSTRAINT "list_products_list_id_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_products" ADD CONSTRAINT "list_products_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_products" ADD CONSTRAINT "list_products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_list_id_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;