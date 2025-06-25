-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totalVolumeBoughtWei" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totalVolumeSoldWei" BIGINT NOT NULL DEFAULT 0;
