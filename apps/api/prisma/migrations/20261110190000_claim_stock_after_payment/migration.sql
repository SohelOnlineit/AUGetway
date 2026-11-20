-- Remember which package was bought, then give unpaid reservations back to available stock.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "packageValueId" TEXT;

UPDATE "order_items" AS item
SET "packageValueId" = picked."packageValueId"
FROM (
  SELECT line.id, MIN(unit."packageValueId") AS "packageValueId"
  FROM "order_items" AS line
  JOIN "inventory_items" AS unit
    ON unit."reservedOrderId" = line."orderId"
   AND unit."productId" = line."productId"
   AND unit."packageValueId" IS NOT NULL
  WHERE line."packageValueId" IS NULL
  GROUP BY line.id
  HAVING COUNT(DISTINCT unit."packageValueId") = 1
) AS picked
WHERE item.id = picked.id
  AND item."packageValueId" IS NULL;

UPDATE "inventory_items" AS item
SET
  status = 'AVAILABLE'::"InventoryStatus",
  "reservedOrderId" = NULL,
  "reservedUntil" = NULL
WHERE item.status = 'RESERVED'::"InventoryStatus"
  AND (
    item."reservedOrderId" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "orders" AS ord WHERE ord.id = item."reservedOrderId"
    )
    OR EXISTS (
      SELECT 1
      FROM "orders" AS ord
      WHERE ord.id = item."reservedOrderId"
        AND ord.status IN (
          'PENDING_PAYMENT'::"OrderStatus",
          'CANCELLED'::"OrderStatus",
          'REFUNDED'::"OrderStatus"
        )
    )
  );
