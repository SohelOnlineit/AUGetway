-- Registration email domain allowlist / blocklist for self-service signup
CREATE TABLE "security_settings" (
  "id" TEXT NOT NULL,
  "registrationEmailAllowDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "registrationEmailBlockDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "security_settings" ("id", "registrationEmailAllowDomains", "registrationEmailBlockDomains", "updatedAt")
VALUES ('default', ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP);
