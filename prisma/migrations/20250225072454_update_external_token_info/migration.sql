/*
  Warnings:

  - You are about to drop the column `auditInfo` on the `ExternalTokenInfo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExternalTokenInfo" DROP COLUMN "auditInfo",
ADD COLUMN     "isHoneypot" TEXT,
ADD COLUMN     "isMintable" TEXT,
ADD COLUMN     "isPotentiallyScam" TEXT,
ADD COLUMN     "totalSupply" TEXT;
