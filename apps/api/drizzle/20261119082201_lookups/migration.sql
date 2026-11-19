CREATE TABLE "categories" (
	"code" text PRIMARY KEY,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"code" text PRIMARY KEY,
	"kind" text NOT NULL,
	"allows_decimal" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "units_kind_check" CHECK ("kind" IN ('count', 'mass', 'volume'))
);
--> statement-breakpoint
INSERT INTO "categories" ("code", "sort_order") VALUES
	('produce', 10),
	('bakery', 20),
	('deli', 30),
	('meat', 40),
	('fish', 50),
	('dairy', 60),
	('pasta_rice', 70),
	('baking', 80),
	('pantry', 90),
	('breakfast', 100),
	('snacks', 110),
	('beverages', 120),
	('frozen', 130),
	('household', 140),
	('personal_care', 150),
	('baby', 160),
	('pets', 170),
	('other', 180);
--> statement-breakpoint
INSERT INTO "units" ("code", "kind", "allows_decimal", "sort_order") VALUES
	('pc', 'count', false, 10),
	('g', 'mass', false, 20),
	('hg', 'mass', true, 30),
	('kg', 'mass', true, 40),
	('ml', 'volume', false, 50),
	('cl', 'volume', true, 60),
	('l', 'volume', true, 70);
