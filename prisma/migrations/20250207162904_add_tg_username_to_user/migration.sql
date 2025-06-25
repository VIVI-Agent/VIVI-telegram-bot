/*
  Warnings:

  - A unique constraint covering the columns `[tgUsername]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tgUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_tgUsername_key" ON "User"("tgUsername");
