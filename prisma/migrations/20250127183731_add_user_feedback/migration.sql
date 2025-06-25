-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
