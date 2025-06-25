-- CreateTable
CREATE TABLE "Allowance" (
    "id" SERIAL NOT NULL,
    "walletId" INTEGER NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "spender" TEXT NOT NULL,
    "allowance" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allowance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
