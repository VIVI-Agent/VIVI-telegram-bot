/*
  Warnings:

  - Added the required column `walletId` to the `Holding` table without a default value. This is not possible if the table is not empty.
  - Added the required column `walletId` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "walletId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "walletId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
