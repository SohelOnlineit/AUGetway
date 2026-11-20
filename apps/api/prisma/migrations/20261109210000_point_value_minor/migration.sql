-- One completed taka/points pair is worth 1 taka, whatever those two amounts are.
ALTER TABLE "point_accounts" ADD COLUMN "valueMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "point_entries" ADD COLUMN "valueMinor" INTEGER NOT NULL DEFAULT 0;
