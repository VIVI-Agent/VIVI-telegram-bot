-- CreateEnum
CREATE TYPE "WhitelistType" AS ENUM ('DAOSWORLD', 'OTHER');

-- AlterTable
ALTER TABLE "FeeWhitelist" ADD COLUMN     "bonusPointsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "type" "WhitelistType" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;
