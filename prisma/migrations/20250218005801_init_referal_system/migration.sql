-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referredById" INTEGER;

-- CreateTable
CREATE TABLE "GlobalConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "referralBonusPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,

    CONSTRAINT "GlobalConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
