-- CreateTable
CREATE TABLE "kol_users" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_groups" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "type" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_group_settings" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "walletAddress" TEXT,
    "amount1" TEXT NOT NULL DEFAULT '0.02',
    "amount2" TEXT NOT NULL DEFAULT '0.04',
    "amount3" TEXT NOT NULL DEFAULT '0.07',
    "amount4" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_group_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_bot_sessions" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kol_bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kol_users_telegramId_key" ON "kol_users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "kol_groups_telegramId_key" ON "kol_groups"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "kol_group_settings_groupId_key" ON "kol_group_settings"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "kol_bot_sessions_sessionId_key" ON "kol_bot_sessions"("sessionId");

-- AddForeignKey
ALTER TABLE "kol_groups" ADD CONSTRAINT "kol_groups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "kol_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_group_settings" ADD CONSTRAINT "kol_group_settings_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "kol_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
