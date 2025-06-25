/*
  Warnings:

  - You are about to drop the column `amount` on the `Trade` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "amount",
ADD COLUMN     "ethReceived" TEXT,
ADD COLUMN     "ethSpent" TEXT,
ADD COLUMN     "tokensReceived" TEXT,
ADD COLUMN     "tokensSpent" TEXT;
