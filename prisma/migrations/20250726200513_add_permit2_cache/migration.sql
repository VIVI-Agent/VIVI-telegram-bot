-- CreateTable
CREATE TABLE "Permit2Allowance" (
    "id" SERIAL NOT NULL,
    "walletId" INTEGER NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "spender" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "expiration" TEXT NOT NULL,
    "permit2Address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit2Allowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Permit2Allowance_walletId_idx" ON "Permit2Allowance"("walletId");

-- CreateIndex
CREATE INDEX "Permit2Allowance_tokenId_idx" ON "Permit2Allowance"("tokenId");

-- CreateIndex
CREATE INDEX "Permit2Allowance_spender_idx" ON "Permit2Allowance"("spender");

-- CreateIndex
CREATE UNIQUE INDEX "Permit2Allowance_walletId_tokenId_spender_permit2Address_key" ON "Permit2Allowance"("walletId", "tokenId", "spender", "permit2Address");

-- AddForeignKey
ALTER TABLE "Permit2Allowance" ADD CONSTRAINT "Permit2Allowance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit2Allowance" ADD CONSTRAINT "Permit2Allowance_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
