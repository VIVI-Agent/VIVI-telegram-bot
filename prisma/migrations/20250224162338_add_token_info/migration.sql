-- CreateTable
CREATE TABLE "ExternalTokenInfo" (
    "id" SERIAL NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "auditInfo" TEXT,
    "website" TEXT,
    "telegramLink" TEXT,
    "twitterLink" TEXT,
    "totalHolders" INTEGER,
    "marketCapUsd" DECIMAL(38,18),
    "fullyDilutedMc" DECIMAL(38,18),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTokenInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPoolInfo" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "tokenId" INTEGER,
    "dexName" TEXT,
    "feeTier" INTEGER,
    "liquidityUsd" DECIMAL(38,18),
    "volume24hUsd" DECIMAL(38,18),
    "priceUsd" DECIMAL(38,18),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPoolInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTokenInfo_tokenId_key" ON "ExternalTokenInfo"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPoolInfo_address_key" ON "ExternalPoolInfo"("address");

-- AddForeignKey
ALTER TABLE "ExternalTokenInfo" ADD CONSTRAINT "ExternalTokenInfo_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPoolInfo" ADD CONSTRAINT "ExternalPoolInfo_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;
