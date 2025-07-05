/*
  Warnings:

  - You are about to drop the column `expiresAt` on the `BankrCache` table. All the data in the column will be lost.
  - You are about to drop the column `isExpired` on the `BankrCache` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "BankrCache_expiresAt_idx";

-- DropIndex
DROP INDEX "BankrCache_isExpired_idx";

-- AlterTable
ALTER TABLE "BankrCache" DROP COLUMN "expiresAt",
DROP COLUMN "isExpired";

-- CreateIndex
CREATE INDEX "BankrCache_lastAccessed_idx" ON "BankrCache"("lastAccessed");
