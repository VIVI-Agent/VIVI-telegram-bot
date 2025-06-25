-- CreateTable
CREATE TABLE "DexScreenerProfile" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "icon" TEXT,
    "header" TEXT,
    "description" TEXT,
    "links" TEXT,

    CONSTRAINT "DexScreenerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DexScreenerProfile_chainId_tokenAddress_key" ON "DexScreenerProfile"("chainId", "tokenAddress");
