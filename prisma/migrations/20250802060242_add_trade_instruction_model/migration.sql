-- CreateTable
CREATE TABLE "trade_instructions" (
    "id" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenName" TEXT,
    "tokenSymbol" TEXT,
    "amount" TEXT NOT NULL,
    "originalTgUserId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupTitle" TEXT,
    "walletAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_instructions_id_idx" ON "trade_instructions"("id");

-- CreateIndex
CREATE INDEX "trade_instructions_expiresAt_idx" ON "trade_instructions"("expiresAt");
