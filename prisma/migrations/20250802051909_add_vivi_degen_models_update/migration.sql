/*
  Warnings:

  - You are about to drop the column `isEnabled` on the `kol_group_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "kol_group_settings" DROP COLUMN "isEnabled",
ADD COLUMN     "isEnabledForOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEnabledForUsers" BOOLEAN NOT NULL DEFAULT false;
