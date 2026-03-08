# Project Master Brief (v2)

**Launch Alignment Note (March 7, 2026):** For Phase 1 execution, launch_only_v1_spec_and_checklist.md is authoritative where wording differs.

### Purpose of this document
This document is the portable master brief for the project. It should be uploaded into any AI system (particularly Claude Code) so that the AI immediately understands what the project is, what has been done, what data exists, how the website should work, and what to do next.

This brief supersedes all earlier versions and should be treated as the authoritative working context unless a newer version replaces it.

---

# 1. Project Overview

The project is a large structured digital library website for Jewish and Christian writings.

The corpus includes canonical Jewish and Christian texts, deuterocanonical texts, Second Temple Jewish literature, Jewish pseudepigrapha, early Christian apocrypha, rabbinic literature, patristic literature, late antique interpretive traditions, Greco-Roman witness texts, and additional related texts that may not yet have fully verified sources.

The aim is to create a usable, expandable, research-grade text library that functions as a public website.

The immediate goal is to get the basic full texts live on the site first, with solid metadata, stable IDs, hierarchy, and routing. More advanced scholarly features such as canonical passage citations should be added later.

---

# 2. Launch Strategy

### Phase 1
Launch a working site with text pages, metadata, hierarchy, source tracking, and placeholder pages for texts not yet locally ingestible.

### Phase 2
Add canonical citation structures, passage-level anchors, deeper scholarly linking, and cross-references.

The project should not get stuck perfecting citation parsing before launch.

---

# 3. Corpus Scope

The catalogue originated from Early Christian Writings and Early Jewish Writings, then expanded beyond those sources. It now contains 674 rows with stable text IDs, hierarchy fields, source URLs, rights and ingest readiness fields.

The corpus includes all rows, even when a text is not yet ready for safe local ingestion. The website creates a page for every row.

That means the site supports: fully ingested texts, metadata-only pages, review-needed pages, and blocked pages.

---

# 4. Current Data State

The editorial source of truth is a **Google Sheet** (migrated from the earlier Excel workbook).

The current cleaned dataset is based on:
**unified_jewish_christian_master_catalogue_v22_cleaned.xlsx**

This was produced by cleaning v21, which involved: removing 22 duplicate rows, resolving all duplicate slugs, classifying all rows missing tradition or tier values, marking cross-tradition texts as "Shared" rather than duplicating them, assigning proper stable IDs to previously unclassified planned expansion rows, and disambiguating the two Talmud entries.

The Google Sheet should be treated as the live editorial master. The importer reads directly from it via the Google Sheets API.

---

# 5. Taxonomy / Classification Model

A unified 10-tier classification system handles both Jewish and Christian materials consistently.

1. Scriptural Foundations
2. Deuterocanonical / Apocryphal Scriptures
3. Second Temple Jewish Literature
4. Jewish Diaspora Philosophy & Historiography
5. Early Christian Core Literature (Apostolic Period)
6. Early Christian Apocrypha
7. Jewish Pseudepigrapha
8. Early Rabbinic Literature
9. Early Patristic Theology (Pre-Nicene)
10. Late Antique Interpretive Traditions

Tradition values are: Jewish, Christian, Shared, Greco-Roman / Jewish witness, Manichaean / Christian-adjacent.

Texts that belong to both Jewish and Christian traditions are marked as "Shared" and appear once in the catalogue with a single slug and page.

---

# 6. Stable ID System

### Format
TRADITION-TIER-TITLE

Examples: JEW-SCR-Genesis, CHR-ECC-1-Clement, CHR-ECA-Gospel-of-Thomas, JEW-STJ-Community-Rule-1QS

### Rules
IDs must be stable, permanent, machine-safe, and unique. Numeric suffixes are only used for collision resolution. These IDs serve as permanent internal identifiers.

---

# 7. URL / Slug Rules

Slugs are lowercase, hyphenated, free of parentheses and unnecessary punctuation, readable and SEO-friendly.

Bad: shepherd-of-hermas-(visions)
Good: shepherd-of-hermas-visions

---

# 8. Hierarchy Rules

The project supports parent work pages, child text pages, and flat work pages.

Examples:
- /texts/shepherd-of-hermas (parent)
- /texts/shepherd-of-hermas/visions (child)
- /texts/shepherd-of-hermas/mandates (child)
- /texts/mishnah/berakhot (child)
- /texts/genesis (standalone)

The hierarchy improves navigation, future citation structure, readability, and corpus organisation.

---

# 9. Website Philosophy

The website is a readable digital library first, not an overcomplicated scholarly engine on day one.

Early priorities: clean readable text display, stable URLs, hierarchy, browse, metadata, source notes, and placeholder handling for unavailable texts.

Later priorities: passage-level canonical citations, deep linking, commentary layers, intertextual links, parallel texts.

---

# 10. Display Philosophy

The first live version displays the full basic text on each page where safely available: title visible, metadata visible, full text readable, source note visible. If text is unavailable, a placeholder message is shown.

At launch, continuous text display is acceptable. Canonical passage-level display is added later.

---

# 11. Canonical Citation Policy

Canonical citation support is desired but is not the first build priority.

Eventually the system should support: Bible (chapter + verse), Mishnah (chapter + mishnah), Talmud (folio + line), Josephus (book + chapter + paragraph), 1 Clement (chapter + section), Shepherd of Hermas (unit + paragraph).

This should be implemented after the basic site is live.

---

# 12. Ingestion Philosophy

Ingestion means importing rows from the Google Sheet into the database and turning them into structured site records.

Every row produces some kind of site presence. Possible states: Ready, Needs review, Blocked, Planned Expansion.

The importer creates pages for all rows, with different display behaviour depending on readiness and rights.

---

# 13. Technical Stack

The stack is a single-language TypeScript project optimised for Claude Code.

**Next.js** (App Router, TypeScript): handles all website pages, navigation, display, browse, and search UI. Pages are statically generated at build time for performance and simplicity.

**PostgreSQL** (Neon, serverless): stores texts, metadata, ingest state, hierarchy, and later passage data. Also handles full-text search via built-in tsvector support.

**Prisma**: structured access between code and database, migrations, safe schema management.

**TypeScript importer scripts** (same repo, run via tsx): reads the Google Sheet via API, normalises rows, fetches and cleans text, stores content in the database.

There is no separate Python layer. Everything is TypeScript in one repository, one package.json, one language.

There is no separate search engine. PostgreSQL full-text search handles the 674-row corpus comfortably. A dedicated search engine like Meilisearch can be added later if the corpus grows significantly.

---

# 14. Hosting

**Frontend**: Vercel (static generation, CDN delivery)
**Database**: Neon (serverless PostgreSQL)

Two services total. No additional infrastructure needed at launch.

---

# 15. Editorial Workflow: Google Sheets

The editorial source of truth is a Google Sheet, replacing the earlier Excel workbook.

### Why Google Sheets
The project owner can edit it in a browser with no special tools. The importer reads it directly via the Google Sheets API with no file download step. Changes are immediately available. Version history is automatic. It can be shared with collaborators.

### How updates flow
1. Project owner edits the Google Sheet.
2. Importer script runs (manually or triggered by a webhook/cron job).
3. Database is updated from the sheet.
4. Next.js rebuilds statically, generating all pages from the database.
5. Vercel deploys the new build.

Steps 2 to 5 can eventually be automated into a single pipeline triggered by a sheet change.

---

# 16. Role Division: Human vs AI Coder

### What the human project owner does
Define project goals. Maintain the Google Sheet. Decide what fields matter. Review output quality. Make editorial decisions. Choose what becomes public. Decide how placeholder pages should work. Choose design direction. Manage GitHub and hosting accounts at a basic level.

### What the AI coder (Claude Code) should do
Create the Next.js application. Set up PostgreSQL via Neon. Set up Prisma. Define the schema. Build the importer. Build browse and text pages. Build hierarchy handling. Fetch and clean source text. Handle deployment. Keep the architecture ready for later citation-level expansion and post-launch search.

---

# 17. Database Model

A single `texts` table with a self-referential parent relationship replaces the earlier two-table (works + texts) design. This is simpler because every record, whether a standalone text, a parent work, or a child section, is fundamentally a text with metadata.

### Table: texts

| Field | Type | Purpose |
|---|---|---|
| id | Auto-increment | Internal primary key |
| stableTextId | String, unique | Permanent identifier (e.g. CHR-ECC-1-Clement) |
| parentId | Nullable FK to texts.id | Self-referential. Null for standalone/parent texts |
| title | String | Display title |
| slug | String | URL segment |
| fullPath | String | Full URL path (e.g. /texts/shepherd-of-hermas/visions) |
| tradition | String | Jewish, Christian, Shared, etc. |
| tier | String | One of the 10-tier labels |
| genre | String, nullable | Genre classification |
| sourceUrl | String, nullable | Direct full-text URL |
| bodyHtml | Text, nullable | Clean HTML version of the text |
| bodyText | Text, nullable | Plain text version for search |
| rightsStatus | String, nullable | Public Domain, Likely Public Domain, etc. |
| ingestStatus | String | Ready, Needs review, Blocked, Planned Expansion |
| hierarchyLevel | Integer | 1 or 2 |
| alternateTitles | String, nullable | Comma-separated alternate names |
| estimatedDate | String, nullable | e.g. "c. 90–120 CE" |
| citationUnit | String, nullable | e.g. "chapter.section" |
| citationExample | String, nullable | e.g. "1 Clem. 42.1–5" |
| summary | Text, nullable | Description of the text |
| searchVector | tsvector | PostgreSQL full-text search index |
| createdAt | Timestamp | Record creation time |
| updatedAt | Timestamp | Last update time |

### Table: passages (future)

| Field | Type | Purpose |
|---|---|---|
| id | Auto-increment | Internal primary key |
| textId | FK to texts.id | Parent text |
| ref | String | Citation reference string |
| level1 | String | First level (e.g. chapter) |
| level2 | String, nullable | Second level (e.g. verse) |
| level3 | String, nullable | Third level |
| content | Text | Passage content |

The passages table should not block launch.

---

# 18. Minimum Viable Website

### Pages
Home, /texts (browse), parent work page, text page.

### Features
Browse corpus. Title display. Metadata display. Full text display where available. Placeholder pages where not. Hierarchy navigation. Stable URLs.

### Not required for first launch
Accounts, annotations, canonical passage engine, scholarly commentary system, advanced cross-linking.

---

# 19. Ingestion Workflow

1. Importer reads the Google Sheet via API.
2. Creates or updates text records (including auto-generating parent stubs from child metadata where no explicit parent row exists).
3. Fetches text where source is ready and rights allow.
4. Cleans source HTML or text.
5. Stores bodyHtml and bodyText.
6. Publishes metadata pages for rows without local text.
7. Preserves ingest status and rights information.
8. Optional post-launch: update PostgreSQL search vectors.

The Google Sheet remains the source of truth.

---

# 20. Search Strategy (Post-Launch)

PostgreSQL full-text search using tsvector/tsquery is deferred until after launch.

Indexed fields should include: title, stableTextId, tradition, tier, genre, bodyText.

Launch may ship with no search UI or a static title-only filter on /texts.

---

# 21. Rights / Rehosting Policy

The project distinguishes between: Public Domain, Likely Public Domain, Unknown, Restricted.

The site supports: fully hosted local text, linked source text, placeholder-only record pages.

The importer only auto-ingests text when rights status is Public Domain. All other statuses require manual review.

---

# 22. Build Order

### Phase 1: Foundation
Set up repo. Set up Next.js with App Router. Set up Neon PostgreSQL. Set up Prisma. Define schema. Create importer skeleton. Import sheet rows. Build basic browse page. Build basic text pages.

### Phase 2: Content Pipeline
Fetch full texts for ready rows. Clean HTML/text. Store bodyHtml and bodyText. Support metadata-only pages. Implement hierarchy display. Auto-generate parent stubs.

### Phase 3: Search and Polish
Add PostgreSQL full-text search. Add filters. Improve display and UI. Add parent/child navigation.

### Phase 4: Scholarly Expansion
Create passage model. Add canonical citation support. Add deep linking. Add commentary layers. Add cross-text references. Add parallel texts.

---

# 23. URL Stability Rule

If a text page launches at /texts/shepherd-of-hermas/visions, that URL must remain permanent.

Later passage-level URLs can be added under it (e.g. /texts/shepherd-of-hermas/visions/1/2) but the main page URL must never change.

---

# 24. Routing

A single catch-all route handles all text pages:

```
app/texts/[...slug]/page.tsx
```

This catches both /texts/genesis (single segment) and /texts/shepherd-of-hermas/visions (two segments). The page component looks up the text by its fullPath and renders accordingly.

---

# 25. Static Generation

The corpus changes only when the Google Sheet is updated and the importer runs. All pages are statically generated at build time using Next.js. With 674 pages, a full build takes seconds. Vercel serves the result from its CDN. The database is only hit at build time, not on every page visit.

---

# 26. Shared Text Policy

Texts that belong to both Jewish and Christian traditions (e.g. Odes of Solomon, Testaments of the Twelve Patriarchs) are marked with Tradition = "Shared" and appear once in the catalogue. There is one row, one slug, one page, and one stable ID per text. No duplication.

---

# 27. What Has Already Been Decided

The following points are established and should not be re-debated unless there is a serious reason:

- Launch with basic full text first, add canonical citations later.
- Keep all rows in the corpus, even if not yet ingestible.
- Create placeholder/metadata pages for unresolved texts.
- Use stable text IDs.
- Use cleaned slugs without parentheses.
- Use hierarchy for naturally subdivided works.
- Use a single texts table with self-referential parentId.
- Use a single-language TypeScript stack: Next.js + PostgreSQL + Prisma.
- Use Google Sheets as the editorial source of truth.
- Defer PostgreSQL full-text search until post-launch; do not block launch on search.
- Use static generation for all pages.
- Mark cross-tradition texts as "Shared" with no duplicate rows.

---

# 28. What the Next AI Should Do

If another AI is given this brief, the next useful output is one of:

**Option A**: Begin building the Next.js application, Prisma schema, and importer.

**Option B**: Design the website information architecture and page templates.

**Option C**: Continue improving the Google Sheet and ingestion rules.

The next AI should not restart the project from scratch or suggest a completely different approach unless explicitly asked.

---

# 29. Short Plain-English Summary

This project is a large digital library website for Jewish and Christian writings. A structured Google Sheet drives the site. The first version should ingest the sheet, create pages for every row, show full text where safe, show metadata placeholders where text is missing, and use stable IDs and hierarchy.

The site is built with Next.js, PostgreSQL (Neon), and Prisma, all in TypeScript. Pages are statically generated. There is no separate Python layer and no separate search engine. The Google Sheet is the editorial source of truth. The codebase is the delivery mechanism.
