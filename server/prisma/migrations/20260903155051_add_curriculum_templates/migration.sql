-- CreateTable
CREATE TABLE "CurriculumTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sourceHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CurriculumTemplateItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "curriculumTemplateId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedHours" REAL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CurriculumTemplateItem_curriculumTemplateId_fkey" FOREIGN KEY ("curriculumTemplateId") REFERENCES "CurriculumTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumTemplate_sourceHash_key" ON "CurriculumTemplate"("sourceHash");

-- CreateIndex
CREATE INDEX "CurriculumTemplateItem_curriculumTemplateId_idx" ON "CurriculumTemplateItem"("curriculumTemplateId");
