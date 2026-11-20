CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

ALTER TABLE "users" ADD COLUMN "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM';
