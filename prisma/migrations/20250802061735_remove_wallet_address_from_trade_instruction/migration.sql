/*
  Warnings:

  - You are about to drop the column `walletAddress` on the `trade_instructions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "trade_instructions" DROP COLUMN "walletAddress";
