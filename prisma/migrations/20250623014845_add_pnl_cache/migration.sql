-- CreateTable
CREATE TABLE "PnlCache" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "holdingId" INTEGER,
    "currentValueWei" TEXT NOT NULL,
    "currentPriceWei" TEXT NOT NULL,
    "costBasisWei" TEXT NOT NULL,
    "unrealizedPnlWei" TEXT NOT NULL,
    "realizedPnlWei" TEXT NOT NULL,
    "totalPnlWei" TEXT NOT NULL,
    "percentageReturn" TEXT NOT NULL,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBlockchainCheck" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PnlCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PnlCache_holdingId_key" ON "PnlCache"("holdingId");

-- CreateIndex
CREATE INDEX "PnlCache_userId_idx" ON "PnlCache"("userId");

-- CreateIndex
CREATE INDEX "PnlCache_userId_holdingId_idx" ON "PnlCache"("userId", "holdingId");

-- CreateIndex
CREATE INDEX "PnlCache_isStale_idx" ON "PnlCache"("isStale");

-- AddForeignKey
ALTER TABLE "PnlCache" ADD CONSTRAINT "PnlCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PnlCache" ADD CONSTRAINT "PnlCache_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
