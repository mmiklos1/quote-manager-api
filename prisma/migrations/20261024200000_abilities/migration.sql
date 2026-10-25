-- Abilities are the global action list. A permissions row is a company role.
-- company_user_permissions still assigns those roles to one membership.
-- write:<resource> implies read:<resource> in the API check, not by a second row.
-- Each company's admin permission (is_admin) holds every ability.
-- Checks and triggers below are not in schema.prisma. Do not drop them in a later diff.

CREATE TABLE "abilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission_abilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "permission_id" UUID NOT NULL,
    "ability_id" UUID NOT NULL,

    CONSTRAINT "permission_abilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "abilities_key_key" ON "abilities"("key");
CREATE UNIQUE INDEX "abilities_action_resource_key" ON "abilities"("action", "resource");
CREATE UNIQUE INDEX "permission_abilities_permission_id_ability_id_key" ON "permission_abilities"("permission_id", "ability_id");

ALTER TABLE "permission_abilities" ADD CONSTRAINT "permission_abilities_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "permission_abilities" ADD CONSTRAINT "permission_abilities_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abilities" ADD CONSTRAINT "abilities_action_check" CHECK ("action" IN ('read', 'write'));
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_resource_check" CHECK ("resource" ~ '^[a-z][a-z0-9_]*$');
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_key_check" CHECK ("key" = "action" || ':' || "resource");

CREATE OR REPLACE FUNCTION "abilities_grant_to_admins"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "permission_abilities" ("permission_id", "ability_id")
  SELECT "permissions"."id", NEW."id"
  FROM "permissions"
  WHERE "permissions"."is_admin" = true
  ON CONFLICT ("permission_id", "ability_id") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "abilities_grant_to_admins_trg"
AFTER INSERT ON "abilities"
FOR EACH ROW
EXECUTE FUNCTION "abilities_grant_to_admins"();

CREATE OR REPLACE FUNCTION "permissions_grant_admin_abilities"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_admin" THEN
    INSERT INTO "permission_abilities" ("permission_id", "ability_id")
    SELECT NEW."id", "abilities"."id"
    FROM "abilities"
    ON CONFLICT ("permission_id", "ability_id") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "permissions_grant_admin_abilities_trg"
AFTER INSERT OR UPDATE OF "is_admin" ON "permissions"
FOR EACH ROW
EXECUTE FUNCTION "permissions_grant_admin_abilities"();

-- One admin role for every company, including companies created later.
CREATE OR REPLACE FUNCTION "companies_seed_admin_permission"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "permissions" ("company_id", "name", "is_admin")
  SELECT NEW."id", 'admin', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM "permissions"
    WHERE "company_id" = NEW."id"
      AND ("is_admin" = true OR "name" = 'admin')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER "companies_seed_admin_permission_trg"
AFTER INSERT ON "companies"
FOR EACH ROW
EXECUTE FUNCTION "companies_seed_admin_permission"();

INSERT INTO "abilities" ("key", "action", "resource")
VALUES
  ('read:catalog', 'read', 'catalog'),
  ('write:catalog', 'write', 'catalog');

INSERT INTO "permissions" ("company_id", "name", "is_admin")
SELECT "companies"."id", 'admin', true
FROM "companies"
WHERE NOT EXISTS (
  SELECT 1
  FROM "permissions"
  WHERE "permissions"."company_id" = "companies"."id"
    AND ("permissions"."is_admin" = true OR "permissions"."name" = 'admin')
);
