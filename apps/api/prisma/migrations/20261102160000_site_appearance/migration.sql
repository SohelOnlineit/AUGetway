ALTER TABLE "site_content_settings"
  ADD COLUMN "logoAlt" TEXT NOT NULL DEFAULT 'UniQbd',
  ADD COLUMN "lightLogoPath" TEXT,
  ADD COLUMN "darkLogoPath" TEXT,
  ADD COLUMN "adminFaviconPath" TEXT;
