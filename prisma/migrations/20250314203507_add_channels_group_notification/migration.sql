-- CreateTable
CREATE TABLE "ChannelOrGroup" (
    "id" SERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelOrGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelOrGroup_chatId_key" ON "ChannelOrGroup"("chatId");
