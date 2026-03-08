# Launch-Only v1 Spec and Checklist
## Unified Jewish-Christian Text Library

This document defines the minimum, unambiguous implementation required to get the full corpus online quickly and safely.

It supersedes conflicting launch details in older planning documents for Phase 1.

---

## 1. Launch Goal

Publish a stable public site where every catalogue row has a page and URL, with readable metadata and clear availability state.

Launch does not depend on full-text ingestion, canonical citations, or advanced search.

---

## 2. Hard Scope (In)

1. Google Sheet as editorial source of truth.
2. Import all rows into database.
3. One public page per row.
4. Stable permanent URL per row.
5. Parent/child navigation for hierarchical rows.
6. Metadata rendering (title, tradition, tier, ingest status, source link, rights status when present).
7. Placeholder state for rows without local full text.

---

## 3. Out of Scope (Later)

1. Canonical passage parsing and passage table usage.
2. Runtime database-backed full-text search.
3. Annotation, commentary, accounts, and intertextual tooling.
4. Blocking launch on remote text fetching/cleaning quality.

---

## 4. Canonical Data Rules

1. `Stable_Text_ID` is immutable and unique.
2. `Suggested_Hierarchical_Path` is the canonical URL key (`texts.fullPath`).
3. `Site_Slug` is a segment-level attribute; it must not override `Suggested_Hierarchical_Path`.
4. URL paths must be unique.
5. Slugs must be unique where required by current hierarchy rules.
6. Every imported row must produce exactly one page state: `full_text`, `metadata_only`, `review_needed`, or `blocked`.

---

## 5. Minimal Schema for Launch

Use one `texts` table with self-referential `parentId`.

Required fields:
- `stableTextId` (unique)
- `title`
- `fullPath` (unique)
- `slug`
- `tradition`
- `tier`
- `hierarchyLevel`
- `ingestStatus`
- `parentId` (nullable FK to `texts.id`)

Optional launch fields:
- `sourceUrl`
- `rightsStatus`
- `alternateTitles`
- `estimatedDate`
- `genre`
- `summary`
- `bodyHtml`
- `bodyText`

Do not block launch on search vector migration.

---

## 6. Importer Contract (Launch Mode)

### Input
Google Sheet rows with required columns:
- `Stable_Text_ID`
- `Canonical_Display_Title`
- `Site_Slug`
- `Suggested_Hierarchical_Path`
- `Tradition`
- `Unified_Tier_Label`
- `Hierarchy_Level`
- `Ingest_Readiness`

### Behavior
1. Validate required columns and fail with a clear report if missing.
2. Upsert rows by `Stable_Text_ID`.
3. Set `fullPath` directly from `Suggested_Hierarchical_Path`.
4. Resolve `parentId` from hierarchy fields; auto-create parent stubs only when needed.
5. Never delete records on launch imports.
6. Fetch/store full text only for `READY + Public Domain`.
7. If remote fetch fails, preserve metadata page and mark non-fatal import warning.
8. Emit import summary counts: total rows, upserts, parent stubs, full-text successes, full-text failures, metadata-only pages.

---

## 7. Rendering Contract

### Route
`/texts/[...slug]` resolves by exact `fullPath`.

### Page States
1. `full_text`: metadata + body.
2. `metadata_only`: metadata + "text not yet locally available".
3. `review_needed`: metadata + "source under review".
4. `blocked`: metadata + "not currently available for local hosting".

The user must never encounter a missing page for an existing row.

---

## 8. Search Policy for Launch

No runtime full-text search required for launch.

Acceptable launch options:
1. No search UI.
2. Title-only filter on `/texts` using preloaded static data.

PostgreSQL `tsvector` search is deferred until post-launch.

---

## 9. Deployment Contract

Release is valid when:
1. Import succeeds with non-fatal warnings allowed.
2. Static build succeeds.
3. All imported `fullPath` routes generate pages.
4. Sample QA passes (see checklist below).

---

## 10. Strict MVP Checklist

Mark each item pass/fail.

### Data Integrity
1. `Stable_Text_ID` uniqueness validated.
2. `fullPath` uniqueness validated.
3. Required columns present.
4. All rows imported (count parity with sheet).

### Routing and Pages
1. Every row resolves at its `fullPath`.
2. Parent/child pages render without broken links.
3. No 404 for any imported `fullPath`.

### Content States
1. `READY + Public Domain` rows attempt full-text ingestion.
2. Failed ingestions remain published as metadata pages.
3. `NEEDS_REVIEW`, `BLOCKED`, `PLANNED_EXPANSION` rows show correct placeholder states.

### Stability
1. URL paths unchanged between consecutive imports unless sheet path changed.
2. Re-running importer is idempotent (no duplicate pages/records).

### Release Decision
1. If all sections above pass, launch.
2. Open post-launch backlog for search and citation features.

---

## 11. Post-Launch Backlog (Ordered)

1. PostgreSQL full-text search + filters.
2. Better text cleaning pipeline and source-specific parsers.
3. Passage/citation model.
4. Scholarly cross-linking and commentary layers.