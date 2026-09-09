-- CreateTable
CREATE TABLE "GeminiDailyUsage" (
    "day" DATE NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GeminiDailyUsage_pkey" PRIMARY KEY ("day")
);
