/*
  Warnings:

  - A unique constraint covering the columns `[tgUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tgUserId" SET DATA TYPE TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_tgUserId_key" ON "User"("tgUserId");
