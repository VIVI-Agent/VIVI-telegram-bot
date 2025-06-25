-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "realizedPnlWei" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "totalCostBasis" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "totalTokensBought" TEXT NOT NULL DEFAULT '0';
