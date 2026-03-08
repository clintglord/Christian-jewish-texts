-- CreateTable
CREATE TABLE "texts" (
    "id" SERIAL NOT NULL,
    "stableTextId" TEXT NOT NULL,
    "parentId" INTEGER,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    "tradition" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "genre" TEXT,
    "sourceUrl" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "rightsStatus" TEXT,
    "ingestStatus" TEXT NOT NULL,
    "hierarchyLevel" INTEGER NOT NULL,
    "alternateTitles" TEXT,
    "estimatedDate" TEXT,
    "citationUnit" TEXT,
    "citationExample" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "texts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "texts_stableTextId_key" ON "texts"("stableTextId");

-- CreateIndex
CREATE UNIQUE INDEX "texts_fullPath_key" ON "texts"("fullPath");

-- CreateIndex
CREATE INDEX "texts_slug_idx" ON "texts"("slug");

-- CreateIndex
CREATE INDEX "texts_tradition_idx" ON "texts"("tradition");

-- CreateIndex
CREATE INDEX "texts_tier_idx" ON "texts"("tier");

-- CreateIndex
CREATE INDEX "texts_parentId_idx" ON "texts"("parentId");

-- AddForeignKey
ALTER TABLE "texts" ADD CONSTRAINT "texts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "texts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
