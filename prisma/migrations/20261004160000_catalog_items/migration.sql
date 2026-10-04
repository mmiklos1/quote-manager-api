-- F-007 Stage 1 catalog. UI Type is not stored.
-- Identity unique includes soft-deleted rows.
-- The self-requirement check is SQL-only. Do not drop it in a later Prisma diff.

CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rental_rate_per_day" DECIMAL(12,2) NOT NULL,
    "image_key" TEXT NOT NULL,
    "derivative_key" TEXT,
    "metadata" JSONB,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "requiring_item_id" UUID NOT NULL,
    "required_item_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_requirements_not_self" CHECK ("requiring_item_id" <> "required_item_id")
);

CREATE UNIQUE INDEX "catalog_items_company_id_manufacturer_model_year_name_key" ON "catalog_items"("company_id", "manufacturer", "model", "year", "name");
CREATE INDEX "catalog_items_company_id_deleted_at_idx" ON "catalog_items"("company_id", "deleted_at");

CREATE UNIQUE INDEX "catalog_requirements_requiring_item_id_required_item_id_key" ON "catalog_requirements"("requiring_item_id", "required_item_id");
CREATE INDEX "catalog_requirements_company_id_deleted_at_idx" ON "catalog_requirements"("company_id", "deleted_at");
CREATE INDEX "catalog_requirements_required_item_id_idx" ON "catalog_requirements"("required_item_id");

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalog_requirements" ADD CONSTRAINT "catalog_requirements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_requirements" ADD CONSTRAINT "catalog_requirements_requiring_item_id_fkey" FOREIGN KEY ("requiring_item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_requirements" ADD CONSTRAINT "catalog_requirements_required_item_id_fkey" FOREIGN KEY ("required_item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
