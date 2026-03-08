# Jewish-Christian Text Library (Launch v1)

## What is implemented
- Next.js App Router scaffold
- Prisma schema for `texts` with self-referential hierarchy
- Google Sheets importer skeleton (`scripts/import.ts`)
- `/texts` browse page
- `/texts/[...slug]` catch-all text route with launch states

## Setup
1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `copy .env.example .env`
3. Fill required env vars in `.env`:
   - `DATABASE_URL`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SHEET_RANGE` (optional default already set)
   - `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
   - `IMPORT_MAX_FETCH` (optional, default unlimited)
   - `IMPORT_SKIP_EXISTING` (optional, default false)
   - `WEB_LOCAL_HTML_DIR` (optional, default `./eng-webbe_html`)
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Create/apply migration:
   - `npm run prisma:migrate`

## Run launch workflow
1. Import:
   - `npm run import`
2. Stage 1 QA run (default auto mode):
   - `npm run qa:stage1`
   - Optional flags:
     - `-- --batch-size 25`
     - `-- --mode auto|random|sequential`
     - `-- --reviewer "Name"`
     - `-- --base-url http://localhost:3001`
     - `-- --seed 12345`
     - `-- --no-source-check`
3. Build:
   - `npm run build`
4. Serve locally:
   - `npm run dev`

## Notes
- Launch does not depend on PostgreSQL full-text search.
- Importer treats remote text-fetch failures as non-fatal; metadata pages still publish.
- For mapped Bible books, importer reads chapter HTML from `WEB_LOCAL_HTML_DIR` first, then falls back to remote.
- Stage 1 QA outputs:
  - Run reports: `qa/runs/<run_id>/report.md`
  - Run issue CSV: `qa/runs/<run_id>/issues.csv`
  - Master issue log: `qa/issues-log.csv`
  - State file (batch sequencing): `qa/state.json`
