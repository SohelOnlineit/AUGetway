-- Order numbers are the sequence value only. Drop the old UQ- prefix.
UPDATE "orders" AS current
SET "orderNumber" = regexp_replace(current."orderNumber", '^UQ-', '')
WHERE current."orderNumber" ~ '^UQ-'
  AND NOT EXISTS (
    SELECT 1
    FROM "orders" AS other
    WHERE other.id <> current.id
      AND other."orderNumber" = regexp_replace(current."orderNumber", '^UQ-', '')
  );
