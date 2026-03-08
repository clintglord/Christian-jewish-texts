# Stage 1 QA

Run the Stage 1 QA process with:

```bash
npm run qa:stage1
```

Outputs:
- `qa/runs/<run_id>/report.md`
- `qa/runs/<run_id>/issues.csv`
- `qa/issues-log.csv`
- `qa/state.json`

Default behavior:
- Batch size: 25
- Mode: `auto` (first two runs random, then sequential)
- Source fidelity checks: enabled

Common options:

```bash
npm run qa:stage1 -- --batch-size 25 --mode auto --reviewer "Reviewer Name" --base-url http://localhost:3001
```
