-- F-003 columns added after the identity migration.
-- country_of_origin stays nullable: the spec has not chosen ISO code vs country name.
-- must_change_password defaults false so existing users and SSO licenses are unchanged.

ALTER TABLE "companies" ADD COLUMN "country_of_origin" TEXT;

ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
