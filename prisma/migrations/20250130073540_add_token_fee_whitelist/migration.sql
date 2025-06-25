-- CreateTable
CREATE TABLE "FeeWhitelist" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeWhitelist_address_key" ON "FeeWhitelist"("address");
