-- CreateTable
CREATE TABLE "BuyEvent" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "bannerImageUrl" TEXT NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "groupChatId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyEventPurchase" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "walletId" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "ethSpentWei" DECIMAL(78,0) NOT NULL,
    "tokensReceivedWei" DECIMAL(78,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyEventPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizedGroup" (
    "id" SERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorizedGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyEventResult" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "leaderboardSnapshot" JSONB NOT NULL,
    "biggestBuyUserId" INTEGER,
    "biggestBuyAmountWei" DECIMAL(78,0),
    "mostPurchasesUserId" INTEGER,
    "totalVolumeWei" DECIMAL(78,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyEventResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyEvent_groupChatId_idx" ON "BuyEvent"("groupChatId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyEventPurchase_txHash_key" ON "BuyEventPurchase"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedGroup_chatId_key" ON "AuthorizedGroup"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyEventResult_eventId_key" ON "BuyEventResult"("eventId");

-- AddForeignKey
ALTER TABLE "BuyEvent" ADD CONSTRAINT "BuyEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyEvent" ADD CONSTRAINT "BuyEvent_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "AuthorizedGroup"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyEventPurchase" ADD CONSTRAINT "BuyEventPurchase_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BuyEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyEventPurchase" ADD CONSTRAINT "BuyEventPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyEventPurchase" ADD CONSTRAINT "BuyEventPurchase_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyEventResult" ADD CONSTRAINT "BuyEventResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BuyEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
