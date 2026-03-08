# Stage 1 QA Report Template

## Run metadata
- run_date:
- reviewer:
- batch_size:
- text_paths_covered:

## Executive summary
- severity_counts:
- top_recurring_issue_types:

## Critical findings (P0/P1)
- Include evidence and recommended fix for each.

## Per-text issue table
- Columns:
  - run_date
  - text_title
  - text_path
  - stable_id
  - source_type
  - source_url
  - issue_category
  - severity
  - evidence
  - recommended_fix
  - status

## Fix queue
- Immediate (P0/P1)
- Next pass (P2)
- Backlog (P3)

## Regression checks
- Re-check at least 10% of previously fixed issues.

## Open risks
- Blockers
- Source provenance gaps
- Ambiguous adjudications
