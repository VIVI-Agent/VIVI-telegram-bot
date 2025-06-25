-- AlterTable
ALTER TABLE "BuySettings" ADD COLUMN     "lastAmount" DOUBLE PRECISION,
ADD COLUMN     "lastSlippage" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SellSettings" ADD COLUMN     "lastAmount" DOUBLE PRECISION,
ADD COLUMN     "lastSlippage" DOUBLE PRECISION;
