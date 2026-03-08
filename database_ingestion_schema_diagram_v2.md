# Database & Ingestion Schema Diagram (v2)

**Launch Alignment Note (March 7, 2026):** For Phase 1 execution, launch_only_v1_spec_and_checklist.md is authoritative where wording differs.

---

# 1. System Data Flow

```text
Google Sheet (Editorial Source)
        │
        │  Google Sheets API
        ▼
TypeScript Importer (scripts/import.ts)
(read → validate → normalise → fetch text → clean)
        │
        ▼
PostgreSQL Database (Neon)
(texts + metadata; tsvector search deferred post-launch)
        │
        │  build time (getStaticProps / generateStaticParams)
        ▼
Next.js Static Build
(674+ HTML pages)
        │
        ▼
Vercel CDN
(public site)
```

---

# 2. Google Sheet → Database Mapping

| Sheet Column | Database Field | Notes |
|---|---|---|
| Stable_Text_ID | texts.stableTextId | Unique permanent identifier |
| Canonical_Display_Title | texts.title | Display name |
| Site_Slug | texts.slug | URL segment |
| Suggested_Hierarchical_Path | texts.fullPath | Full URL path |
| Direct_Full_Text_URL | texts.sourceUrl | Source for fetching text |
| Tradition | texts.tradition | Jewish, Christian, Shared, etc. |
| Unified_Tier_Label | texts.tier | 10-tier classification |
| Genre | texts.genre | Genre label |
| Ingest_Readiness | texts.ingestStatus | Ready, Needs Review, etc. |
| Rights_Status | texts.rightsStatus | Public Domain, etc. |
| Hierarchy_Level | texts.hierarchyLevel | 1 or 2 |
| Parent_Work_Title + Parent_Slug | texts.parentId | Resolved to FK during import |
| Alternate_Titles | texts.alternateTitles | Comma-separated |
| Estimated_Date | texts.estimatedDate | Free-text date string |
| Citation_Unit | texts.citationUnit | e.g. chapter.verse |
| Citation_Example | texts.citationExample | e.g. Gen. 1:1 |

---

# 3. Database Schema

```text
texts
 ├─ id               (auto-increment PK)
 ├─ stableTextId     (unique string, indexed)
 ├─ parentId         (nullable FK → texts.id)
 ├─ title            (string)
 ├─ slug             (string, indexed)
 ├─ fullPath         (string, unique, indexed)
 ├─ tradition        (string)
 ├─ tier             (string)
 ├─ genre            (nullable string)
 ├─ sourceUrl        (nullable string)
 ├─ bodyHtml         (nullable text)
 ├─ bodyText         (nullable text)
 ├─ rightsStatus     (nullable string)
 ├─ ingestStatus     (string)
 ├─ hierarchyLevel   (integer)
 ├─ alternateTitles  (nullable string)
 ├─ estimatedDate    (nullable string)
 ├─ citationUnit     (nullable string)
 ├─ citationExample  (nullable string)
 ├─ summary          (nullable text)
 ├─ searchVector     (tsvector, GIN indexed)
 ├─ createdAt        (timestamp)
 └─ updatedAt        (timestamp)
```

### Self-referential relationship

```text
texts (parent: parentId = null)
   │
   └───< texts (children: parentId = parent.id)
```

Example:
```text
Shepherd of Hermas  (id: 10, parentId: null, hierarchyLevel: 1)
   ├─ Visions       (id: 11, parentId: 10, hierarchyLevel: 2)
   ├─ Mandates      (id: 12, parentId: 10, hierarchyLevel: 2)
   └─ Similitudes   (id: 13, parentId: 10, hierarchyLevel: 2)
```

---

# 4. Prisma Schema

```prisma
model Text {
  id              Int       @id @default(autoincrement())
  stableTextId    String    @unique
  parentId        Int?
  parent          Text?     @relation("TextHierarchy", fields: [parentId], references: [id])
  children        Text[]    @relation("TextHierarchy")
  title           String
  slug            String
  fullPath        String    @unique
  tradition       String
  tier            String
  genre           String?
  sourceUrl       String?
  bodyHtml        String?
  bodyText        String?
  rightsStatus    String?
  ingestStatus    String
  hierarchyLevel  Int
  alternateTitles String?
  estimatedDate   String?
  citationUnit    String?
  citationExample String?
  summary         String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([slug])
  @@index([tradition])
  @@index([tier])
  @@index([parentId])
  @@map("texts")
}
```

The searchVector tsvector column can be added post-launch via a raw SQL migration, since Prisma does not natively support tsvector.

---

# 5. Importer Logic

```text
Connect to Google Sheets API
        │
        ▼
Fetch all rows from master sheet
        │
        ▼
Validate required columns:
  Stable_Text_ID, Canonical_Display_Title, Site_Slug,
  Suggested_Hierarchical_Path, Tradition, Unified_Tier_Label,
  Hierarchy_Level, Ingest_Readiness
        │
        ▼
Pass 1: Upsert all level-1 (parent/standalone) texts
        │
        ▼
Pass 2: For each level-2 (child) row:
        │
        ├─ Look up parent by Parent_Slug
        │   (auto-create parent stub if missing)
        │
        └─ Upsert child text with parentId
        │
        ▼
Pass 3: For each READY + Public Domain row:
        │
        ├─ Fetch text from sourceUrl
        ├─ Clean HTML (strip nav, ads, headers)
        ├─ Extract plain text for search
        └─ Store bodyHtml and bodyText
        │
        ▼
Optional post-launch: update search vectors (raw SQL)
        │
        ▼
Done. Run: next build
```

---

# 6. Website Page Generation

```text
Database (texts table)
        │
        ▼
generateStaticParams()
  → returns all fullPath values
        │
        ▼
For each fullPath:
  getStaticProps() fetches text record + children
        │
        ▼
Page rendered as static HTML

Example:
  fullPath: /texts/shepherd-of-hermas/visions
  URL:      https://site.com/texts/shepherd-of-hermas/visions
  Route:    app/texts/[...slug]/page.tsx
```

---

# 7. Search Implementation (Post-Launch)

```sql
-- Generated tsvector column (added via raw SQL migration)
ALTER TABLE texts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(alternate_titles, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tradition, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(tier, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'C')
  ) STORED;

CREATE INDEX texts_search_idx ON texts USING GIN (search_vector);

-- Query example
SELECT id, title, slug, full_path,
       ts_rank(search_vector, query) AS rank
FROM texts, plainto_tsquery('english', 'shepherd hermas') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

Implement after launch; can be exposed via a Next.js API route (/api/search) or a server action.

---

# 8. Future Expansion: Passages

```text
passages (added in Phase 4)
 ├─ id        (auto-increment PK)
 ├─ textId    (FK → texts.id)
 ├─ ref       (string, e.g. "1:3")
 ├─ level1    (string, e.g. "1")
 ├─ level2    (nullable string, e.g. "3")
 ├─ level3    (nullable string)
 └─ content   (text)
```

Enables canonical citation URLs:
```text
/texts/genesis/1/3
/texts/1-clement/42/1
```

---

# 9. Key Architectural Rules

1. Google Sheet is the editorial master.
2. PostgreSQL is the operational store.
3. Website reads from the database at build time only.
4. TypeScript importer synchronises sheet → database.
5. Stable IDs and URLs must never change.
6. Cross-tradition texts are "Shared" with no duplicate rows.
7. All pages are statically generated.
8. Everything is TypeScript in one repository.
9. Search is post-launch and must not block publishing all row pages.
