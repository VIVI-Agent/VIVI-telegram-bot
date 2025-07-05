-- CreateTable
CREATE TABLE "BankrCache" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "evmAddress" TEXT NOT NULL,
    "solanaAddress" TEXT NOT NULL,
    "bankrClub" BOOLEAN NOT NULL,
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankrCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankrCache_username_idx" ON "BankrCache"("username");

-- CreateIndex
CREATE INDEX "BankrCache_platform_idx" ON "BankrCache"("platform");

-- CreateIndex
CREATE INDEX "BankrCache_isExpired_idx" ON "BankrCache"("isExpired");

-- CreateIndex
CREATE INDEX "BankrCache_expiresAt_idx" ON "BankrCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankrCache_username_platform_key" ON "BankrCache"("username", "platform");
