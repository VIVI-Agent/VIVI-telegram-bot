-- CreateEnum
CREATE TYPE "SpeedEnum" AS ENUM ('AUTO', 'FAST', 'TURBO');

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "tgUserId" BIGINT NOT NULL,
    "tgUsername" TEXT NOT NULL,
    "subscriptionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waitlistPosition" INTEGER NOT NULL,
    "hasAccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "tgUserId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "speed" "SpeedEnum" NOT NULL DEFAULT 'AUTO',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "encryptedPrivKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuySettings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount1" DOUBLE PRECISION NOT NULL,
    "amount2" DOUBLE PRECISION NOT NULL,
    "amount3" DOUBLE PRECISION NOT NULL,
    "amount4" DOUBLE PRECISION NOT NULL,
    "amount5" DOUBLE PRECISION NOT NULL,
    "slippage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellSettings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount1" DOUBLE PRECISION NOT NULL,
    "amount2" DOUBLE PRECISION NOT NULL,
    "amount3" DOUBLE PRECISION NOT NULL,
    "slippage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_tgUserId_key" ON "Subscriber"("tgUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_tgUsername_key" ON "Subscriber"("tgUsername");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_tgUserId_key" ON "User"("tgUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "BuySettings_userId_key" ON "BuySettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SellSettings_userId_key" ON "SellSettings"("userId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuySettings" ADD CONSTRAINT "BuySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellSettings" ADD CONSTRAINT "SellSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
