# Operator Runbook (Launch v1)
## Unified Jewish-Christian Text Library

This runbook is for operating Phase 1 launch workflow only.
Authoritative scope: metadata-first publication for all rows, stable URLs, placeholders for unavailable texts, search deferred post-launch.

Related docs:
- launch_only_v1_spec_and_checklist.md
- project_master_brief_v2.md
- system_architecture_and_build_roadmap_v2.md
- database_ingestion_schema_diagram_v2.md

---

## 1. Preconditions

1. Google Sheet is the editorial source of truth and contains required columns:
- Stable_Text_ID
- Canonical_Display_Title
- Site_Slug
- Suggested_Hierarchical_Path
- Tradition
- Unified_Tier_Label
- Hierarchy_Level
- Ingest_Readiness

2. Environment variables/secrets are configured for:
- Google Sheets API access
- PostgreSQL (Neon) connection

3. Importer and web app build locally without unresolved dependency errors.

---

## 2. Launch Command Sequence

Run in this order from project root:

```bash
npx tsx scripts/import.ts
next build
```

Optional deploy step (depending on your workflow):

```bash
# push to remote watched by Vercel
```

Do not block release on full-text search setup.

---

## 3. Import Acceptance Criteria

Importer output must include counts for:
- total rows read
- rows upserted
- parent stubs created
- full-text fetch successes
- full-text fetch failures
- metadata-only pages

Pass rules:
1. Required columns validated.
2. Row count parity with source sheet.
3. No duplicate Stable_Text_ID.
4. No duplicate fullPath.
5. Full-text fetch failures are warnings, not launch blockers, if metadata pages still publish.

---

## 4. Build Acceptance Criteria

1. Static build completes successfully.
2. Route generation includes all imported fullPath values.
3. No systemic page-generation failure.

---

## 5. QA Gate (Must Pass)

Sample checks:
1. Standalone text route resolves (example pattern: /texts/genesis).
2. Parent route resolves and lists children.
3. Child route resolves (example pattern: /texts/{parent}/{child}).
4. READY + Public Domain example displays local body text when available.
5. NEEDS_REVIEW example displays review placeholder.
6. BLOCKED or PLANNED_EXPANSION example displays metadata-only placeholder.
7. No imported route returns 404.

If all pass, release.

---

## 6. Rollback / Recovery

If import fails hard:
1. Fix sheet schema/data issue.
2. Re-run importer.
3. Re-run build.

If build fails:
1. Fix build/runtime code issue.
2. Re-run build.
3. Re-run QA gate.

If remote text fetches fail:
1. Keep metadata pages live.
2. Log failed sources for later retry.
3. Do not block launch unless failures break page generation.

---

## 7. Post-Launch Routine

Per update cycle:
1. Edit Google Sheet.
2. Run importer.
3. Run build.
4. Deploy.
5. Run quick QA gate.

Post-launch backlog order:
1. PostgreSQL full-text search + filters.
2. Better source-specific text cleaning.
3. Passage/citation model.
4. Scholarly cross-linking/commentary layers.
