-- Owned quantity for a catalog item. Default 1. Not a per-unit serial.
-- The non-negative check is SQL-only. Do not drop it in a later diff.

ALTER TABLE "catalog_items" ADD COLUMN "unit_count" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_unit_count_check" CHECK ("unit_count" >= 0);
