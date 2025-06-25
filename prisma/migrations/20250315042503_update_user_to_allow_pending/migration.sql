-- DropIndex
DROP INDEX "User_tgUserId_key";

-- DropIndex
DROP INDEX "User_tgUsername_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPending" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "tgUserId" DROP NOT NULL;
