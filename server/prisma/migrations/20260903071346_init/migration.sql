-- CreateTable
CREATE TABLE "School" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CurriculumItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolClassId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedHours" REAL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurriculumItem_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolClassId" INTEGER NOT NULL,
    "weekStartDate" DATETIME NOT NULL,
    "hoursPerWeek" REAL NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyPlan_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyPlanItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weeklyPlanId" INTEGER NOT NULL,
    "curriculumItemId" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyPlanItem_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeeklyPlanItem_curriculumItemId_fkey" FOREIGN KEY ("curriculumItemId") REFERENCES "CurriculumItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolClassId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SchoolClass_schoolId_idx" ON "SchoolClass"("schoolId");

-- CreateIndex
CREATE INDEX "CurriculumItem_schoolClassId_idx" ON "CurriculumItem"("schoolClassId");

-- CreateIndex
CREATE INDEX "WeeklyPlan_schoolClassId_idx" ON "WeeklyPlan"("schoolClassId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_schoolClassId_weekStartDate_key" ON "WeeklyPlan"("schoolClassId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_weeklyPlanId_idx" ON "WeeklyPlanItem"("weeklyPlanId");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_curriculumItemId_idx" ON "WeeklyPlanItem"("curriculumItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlanItem_weeklyPlanId_curriculumItemId_key" ON "WeeklyPlanItem"("weeklyPlanId", "curriculumItemId");

-- CreateIndex
CREATE INDEX "ChatMessage_schoolClassId_idx" ON "ChatMessage"("schoolClassId");
