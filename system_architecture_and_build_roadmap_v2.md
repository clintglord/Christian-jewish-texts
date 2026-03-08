# System Architecture & Build Roadmap (v2)

**Launch Alignment Note (March 7, 2026):** For Phase 1 execution, launch_only_v1_spec_and_checklist.md is authoritative where wording differs.

Companion to: project_master_brief_v2.md and launch_only_v1_spec_and_checklist.md

---

# 1. High-Level System Overview

```text
Google Sheet
(editorial source of truth)
        ↓
TypeScript Importer (same repo)
(read via API → normalise → fetch → clean)
        ↓
PostgreSQL Database (Neon)
(texts, metadata, ingest state; search vectors deferred post-launch)
        ↓
Next.js (static build)
(browse pages, parent work pages, text pages)
        ↓
Vercel CDN
(static HTML served globally)
```

Everything is TypeScript. One language, one repository, two hosted services (Vercel + Neon).

---

# 2. What Each Layer Does

## A. Google Sheet (Editorial Source of Truth)
Contains text metadata, stable IDs, titles, slugs, hierarchy fields, source URLs, rights/reuse notes, and ingest readiness. The project owner edits this directly in a browser. The importer reads it via the Google Sheets API.

## B. TypeScript Importer (scripts/ directory)
Reads the Google Sheet via API. Normalises rows. Creates/updates text records in the database. Fetches full texts where allowed. Cleans source HTML/text. Stores content locally. Preserves ingest state. Auto-generates parent stubs from child metadata where no explicit parent row exists. May update PostgreSQL search vectors post-launch.

Run with: `npx tsx scripts/import.ts`

## C. PostgreSQL Database (Neon)
Stores texts, metadata, source links, body HTML, body plain text, rights state, ingest state, and tsvector search indices. This is the operational store for the website. The Google Sheet remains the editorial master.

## D. Next.js Website (Static Generation)
Generates all pages at build time from the database. Displays browse pages, parent work pages, and text pages. Shows metadata and full text where available, placeholder pages where not. Preserves stable URLs. Served as static HTML via Vercel CDN. The database is not queried at runtime by visitors.

## E. PostgreSQL Full-Text Search (Post-Launch)
Built into the database using tsvector/tsquery. No separate search engine. This is deferred until post-launch and must not block Phase 1 release.

---

# 3. Data Flow

### Import cycle
```text
1. Project owner edits Google Sheet
2. Importer reads sheet via API
3. Importer creates/updates database records
4. Importer fetches + stores text if allowed
5. Optional post-launch: search vectors updated in PostgreSQL
6. next build generates all static pages
7. Vercel deploys new build
```

### Ongoing maintenance
```text
Google Sheet change → run importer → database updated → next build → Vercel deploys
```

This can be automated via a GitHub Action or Vercel build hook.

---

# 4. Core Content Entity: Text

There is a single entity type. A text record can be:

**Standalone**: a text with no parent and no children (e.g. Genesis, 1 Clement).

**Parent**: a text with no parent but with children pointing to it (e.g. Shepherd of Hermas, Mishnah).

**Child**: a text with a parentId pointing to its parent (e.g. Shepherd of Hermas / Visions, Mishnah / Berakhot).

This is implemented as a single `texts` table with a nullable self-referential `parentId` foreign key.

### Future entity: Passage
A structured citation unit inside a text (e.g. Genesis 1:3, 1 Clem. 42.1). Not required for Phase 1.

---

# 5. URL Architecture

### Current launch model

| Type | Example URL |
|---|---|
| Browse | /texts |
| Standalone text | /texts/genesis |
| Parent work | /texts/shepherd-of-hermas |
| Child text | /texts/shepherd-of-hermas/visions |
| Other hierarchical | /texts/mishnah/berakhot |

### Routing
A single catch-all route handles everything:

```
app/texts/[...slug]/page.tsx
```

The page component resolves the URL segments against the fullPath field in the database.

### Future expansion
Passage-level URLs added under existing text pages:

```
/texts/genesis/1/3
/texts/shepherd-of-hermas/visions/1/2
```

Existing text-page URLs must remain stable permanently.

---

# 6. Ingestion States

Every Google Sheet row maps to one of these states.

**Ready**: safe source exists, text can be imported, full text displays locally.

**Needs Review**: a source exists but licensing or exactness needs confirmation. Page exists, text may remain external or unavailable locally.

**Blocked**: no safe local text yet. Page exists as metadata-only.

**Planned Expansion**: row exists for future use. Page exists in the corpus structure.

Every row has a page, even if the full text is not yet hosted.

---

# 7. Page Types

### A. Home Page
Explains the library, provides entry points, highlights major collections.

### B. Browse Page (/texts)
Lists or filters the corpus. Launch may omit search UI or use a title-only static filter. Allows browsing by tradition, tier, or genre.

### C. Parent Work Page (e.g. /texts/shepherd-of-hermas)
Shows metadata about the parent work. Lists child texts. Provides navigation.

### D. Text Page (e.g. /texts/shepherd-of-hermas/visions)
Shows full text where available. Shows metadata. Shows source note. Shows placeholder if text is unavailable.

---

# 8. Display Model

### Phase 1
Continuous, simple text display: title, metadata, full body, source attribution, placeholder notice if needed.

### Phase 2+
Structured citation units, anchors, deep links, commentary references.

Phase 1 prioritises usability and launch speed.

---

# 9. Database Schema

```
texts
 ├─ id              (auto-increment PK)
 ├─ stableTextId    (unique string)
 ├─ parentId        (nullable FK → texts.id)
 ├─ title           (string)
 ├─ slug            (string)
 ├─ fullPath        (string, e.g. /texts/shepherd-of-hermas/visions)
 ├─ tradition       (string)
 ├─ tier            (string)
 ├─ genre           (nullable string)
 ├─ sourceUrl       (nullable string)
 ├─ bodyHtml        (nullable text)
 ├─ bodyText        (nullable text)
 ├─ rightsStatus    (nullable string)
 ├─ ingestStatus    (string)
 ├─ hierarchyLevel  (integer: 1 or 2)
 ├─ alternateTitles (nullable string)
 ├─ estimatedDate   (nullable string)
 ├─ citationUnit    (nullable string)
 ├─ citationExample (nullable string)
 ├─ summary         (nullable text)
 ├─ searchVector    (tsvector, optional post-launch)
 ├─ createdAt       (timestamp)
 └─ updatedAt       (timestamp)
```

Relationship:
```
texts (parent, parentId = null)
   │
   └───< texts (children, parentId = parent.id)
```

Example:
```
Shepherd of Hermas (parentId: null)
   ├─ Visions    (parentId: Shepherd of Hermas.id)
   ├─ Mandates   (parentId: Shepherd of Hermas.id)
   └─ Similitudes (parentId: Shepherd of Hermas.id)
```

---

# 10. Importer Logic

```text
Connect to Google Sheets API
        │
        ▼
Read all rows from the master sheet
        │
        ▼
Validate required columns exist
        │
        ▼
For each row:
        │
        ├─ If child (level 2): ensure parent record exists
        │     (auto-create parent stub if not in sheet)
        │
        ├─ Upsert text record by stableTextId
        │
        ├─ If ingestStatus = READY and rightsStatus = Public Domain:
        │       fetch text from sourceUrl
        │       clean HTML
        │       store bodyHtml and bodyText
        │
        └─ Otherwise:
                metadata-only record
                │
                ▼
Optional post-launch: update search vectors
        │
        ▼
Done. Run next build.
```

---

# 11. Search Implementation (Post-Launch)

PostgreSQL full-text search using a generated tsvector column.

```sql
-- Search vector built from key fields
ALTER TABLE texts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tradition, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(tier, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'C')
  ) STORED;

CREATE INDEX texts_search_idx ON texts USING GIN (search_vector);
```

Implement only after launch; can be queried via Prisma raw SQL or a lightweight API route.

---

# 12. Build Roadmap

### Phase 1: Foundation (Launch Scope)
Set up repo. Set up Next.js with App Router and TypeScript. Set up Neon PostgreSQL. Set up Prisma with the texts schema. Create importer skeleton that reads from Google Sheets API. Import all rows. Build basic browse page. Build basic text pages with catch-all routing. Do not block Phase 1 on full-text search implementation.

**Deliverable**: a local working prototype showing all 674 texts as pages.

### Phase 2: Content Pipeline
Fetch full texts for the 125 ready rows. Clean HTML/text. Store bodyHtml and bodyText. Support metadata-only pages for unresolved rows. Implement hierarchy display and parent/child navigation. Auto-generate parent stubs.

**Deliverable**: a usable reading site with real content.

### Phase 3: Search and Polish
Add PostgreSQL full-text search. Add title and keyword search UI. Add filters (tradition, tier, genre). Improve display and UI. Improve metadata panels.

**Deliverable**: a strong public-facing MVP.

### Phase 4: Scholarly Expansion
Create passages table. Add canonical citation support. Add deep linking. Add commentary layers. Add cross-text references. Add parallel texts.

**Deliverable**: research-grade digital corpus features.

---

# 13. Static Generation Strategy

The corpus changes only when the Google Sheet is updated and the importer runs. All 674+ pages are statically generated at build time.

```text
import.ts runs → database populated → next build → 674 static HTML pages → Vercel CDN
```

Benefits: instant page loads, near-zero hosting cost, no runtime database queries, excellent SEO, no server to maintain.

The database is only accessed during: import runs and build-time data fetching (getStaticProps / generateStaticParams).

---

# 14. Deployment Workflow

```text
1. Edit Google Sheet
2. Run: npx tsx scripts/import.ts
3. Run: next build
4. Push to GitHub → Vercel auto-deploys
```

Steps 2 to 4 can be combined into a single build command. Eventually a Google Sheets webhook or scheduled cron job can trigger the full pipeline automatically.

---

# 15. Human vs AI Coder Responsibilities

### Human / Project Owner
Maintains Google Sheet. Reviews outputs. Sets priorities. Approves design and structure. Decides editorial policy. Decides what is publishable.

### AI Coder (Claude Code)
Writes all code. Builds importer. Defines schema. Creates pages. Implements routing. Deploys the app. Maintains integration between systems.

The human owns the editorial model. The coder owns the implementation.

---

# 16. Minimum Success Definition

The first release is successful if: every Google Sheet row generates a page, ready texts display locally where available, missing texts still have metadata pages, hierarchy works, URLs are stable, and browse works. Search is explicitly post-launch.

---

# 17. Future-Proofing Rules

The implementation must preserve: stable IDs, stable page URLs, hierarchy structure, Google Sheet as source of truth.

The architecture must allow: later passage parsing, later scholarly citations, later re-imports without destructive restructuring, later migration to a dedicated search engine if needed.

---

# 18. Visual Mental Model

```text
            Editorial Layer
          ┌─────────────────┐
          │   Google Sheet   │
          │  (browser edit)  │
          └─────────┬───────┘
                    │ Sheets API
                    ▼
           Ingestion Layer
          ┌─────────────────┐
          │  TS Importer     │
          │  (scripts/)      │
          └─────────┬───────┘
                    │
                    ▼
           Storage Layer
          ┌─────────────────┐
          │   PostgreSQL     │
          │   (Neon)         │
          │  texts + metadata│
          └─────────┬───────┘
                    │ build time
                    ▼
           Presentation Layer
          ┌─────────────────┐
          │   Next.js        │
          │  (static HTML)   │
          └─────────┬───────┘
                    │
                    ▼
          ┌─────────────────┐
          │   Vercel CDN     │
          │  (public site)   │
          └─────────────────┘
```
