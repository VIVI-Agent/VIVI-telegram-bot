/*
  Warnings:

  - You are about to drop the column `enabledPresale` on the `GlobalConfig` table. All the data in the column will be lost.
  - You are about to drop the column `realizedPnlWei` on the `Holding` table. All the data in the column will be lost.
  - You are about to drop the column `totalCostBasis` on the `Holding` table. All the data in the column will be lost.
  - You are about to drop the column `totalTokensBought` on the `Holding` table. All the data in the column will be lost.
  - You are about to drop the `AdminUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PnlCache` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subscriber` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PnlCache" DROP CONSTRAINT "PnlCache_holdingId_fkey";

-- DropForeignKey
ALTER TABLE "PnlCache" DROP CONSTRAINT "PnlCache_userId_fkey";

-- AlterTable
ALTER TABLE "GlobalConfig" DROP COLUMN "enabledPresale";

-- AlterTable
ALTER TABLE "Holding" DROP COLUMN "realizedPnlWei",
DROP COLUMN "totalCostBasis",
DROP COLUMN "totalTokensBought";

-- DropTable
DROP TABLE "AdminUser";

-- DropTable
DROP TABLE "PnlCache";

-- DropTable
DROP TABLE "Subscriber";
