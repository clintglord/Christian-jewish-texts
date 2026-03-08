import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/prisma";

type Severity = "P0" | "P1" | "P2" | "P3";
type IssueCategory = "accuracy" | "formatting" | "structure" | "styling" | "proofreading";
type SourceType = "eBible" | "CCEL" | "Sefaria" | "Gutenberg" | "other" | "unknown";
type Status = "open" | "fixed" | "verified";

type Issue = {
  run_date: string;
  text_title: string;
  text_path: string;
  stable_id: string;
  source_type: SourceType;
  source_url: string;
  issue_category: IssueCategory;
  severity: Severity;
  evidence: string;
  recommended_fix: string;
  status: Status;
};

type QaState = {
  runCount: number;
  sequentialOffset: number;
};

type BatchMode = "auto" | "random" | "sequential";

type Args = {
  batchSize: number;
  mode: BatchMode;
  reviewer: string;
  baseUrl: string;
  seed?: number;
  sourceCheck: boolean;
};

type TextRow = {
  stableTextId: string;
  title: string;
  fullPath: string;
  sourceUrl: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
};

type TextAnalysis = {
  text: TextRow;
  inferredSourceType: SourceType;
  inferredSourceUrl: string;
  issues: Issue[];
  sourceChecked: boolean;
  sourceMatches: number;
  sourceSegments: number;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_BASE_URL = "http://localhost:3001";
const STATE_PATH = path.join(process.cwd(), "qa", "state.json");
const RUNS_DIR = path.join(process.cwd(), "qa", "runs");
const MASTER_ISSUES_PATH = path.join(process.cwd(), "qa", "issues-log.csv");
const REPORT_TEMPLATE_PATH = path.join(process.cwd(), "qa", "templates", "stage1-report-template.md");

function parseArgs(argv: string[]): Args {
  const args: Args = {
    batchSize: DEFAULT_BATCH_SIZE,
    mode: "auto",
    reviewer: "qa-operator",
    baseUrl: DEFAULT_BASE_URL,
    sourceCheck: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--batch-size" && next) {
      args.batchSize = Number.parseInt(next, 10);
      i += 1;
    } else if (token === "--mode" && next && (next === "auto" || next === "random" || next === "sequential")) {
      args.mode = next;
      i += 1;
    } else if (token === "--reviewer" && next) {
      args.reviewer = next.trim();
      i += 1;
    } else if (token === "--base-url" && next) {
      args.baseUrl = next.replace(/\/+$/, "");
      i += 1;
    } else if (token === "--seed" && next) {
      args.seed = Number.parseInt(next, 10);
      i += 1;
    } else if (token === "--no-source-check") {
      args.sourceCheck = false;
    }
  }

  if (!Number.isFinite(args.batchSize) || args.batchSize <= 0) {
    throw new Error(`Invalid --batch-size value: ${args.batchSize}`);
  }

  return args;
}

function ensureQaDirs(): void {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_TEMPLATE_PATH), { recursive: true });
}

function loadState(): QaState {
  if (!fs.existsSync(STATE_PATH)) {
    return { runCount: 0, sequentialOffset: 0 };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as Partial<QaState>;
    return {
      runCount: Number.isFinite(parsed.runCount) ? Number(parsed.runCount) : 0,
      sequentialOffset: Number.isFinite(parsed.sequentialOffset) ? Number(parsed.sequentialOffset) : 0,
    };
  } catch {
    return { runCount: 0, sequentialOffset: 0 };
  }
}

function saveState(state: QaState): void {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let m = Math.imul(t ^ (t >>> 15), t | 1);
    m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
    return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
  };
}

function pickBatch(texts: TextRow[], mode: "random" | "sequential", batchSize: number, seed: number, state: QaState): TextRow[] {
  if (texts.length <= batchSize) {
    return [...texts];
  }

  if (mode === "sequential") {
    const offset = state.sequentialOffset % texts.length;
    const picked: TextRow[] = [];
    for (let i = 0; i < batchSize; i += 1) {
      picked.push(texts[(offset + i) % texts.length]);
    }
    state.sequentialOffset = (offset + batchSize) % texts.length;
    return picked;
  }

  const rng = mulberry32(seed);
  const indexed = texts.map((t, index) => ({ t, score: rng() + index * 1e-9 }));
  indexed.sort((a, b) => a.score - b.score);
  return indexed.slice(0, batchSize).map((x) => x.t);
}

function normalizeText(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sampleSegments(input: string, seed: number): string[] {
  const text = normalizeText(input);
  if (!text) return [];
  const size = 140;

  const begin = text.slice(0, size);
  const middleStart = Math.max(0, Math.floor(text.length / 2) - Math.floor(size / 2));
  const middle = text.slice(middleStart, middleStart + size);
  const end = text.slice(Math.max(0, text.length - size));
  const rng = mulberry32(seed);
  const randomStart = Math.max(0, Math.floor(rng() * Math.max(1, text.length - size)));
  const random = text.slice(randomStart, randomStart + size);

  return [begin, middle, end, random]
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

function inferSource(text: TextRow): { sourceType: SourceType; sourceUrl: string } {
  const source = (text.sourceUrl || "").trim();
  const html = text.bodyHtml || "";

  if (/ebible\.org/i.test(source) || /eBible\.org/i.test(html)) return { sourceType: "eBible", sourceUrl: source };
  if (/ccel\.org/i.test(source) || /fathers\./i.test(html)) return { sourceType: "CCEL", sourceUrl: source };
  if (/sefaria\.org/i.test(source) || /data-source="sefaria"/i.test(html)) return { sourceType: "Sefaria", sourceUrl: source };
  if (/gutenberg\.org/i.test(source) || /Project Gutenberg/i.test(html)) return { sourceType: "Gutenberg", sourceUrl: source };
  if (source) return { sourceType: "other", sourceUrl: source };
  return { sourceType: "unknown", sourceUrl: "" };
}

async function fetchWithTimeout(url: string, ms = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractArticle(html: string): string {
  const match = html.match(/<article class="panel">([\s\S]*?)<\/article>/i);
  return match?.[1] ?? "";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

function issuesToCsv(issues: Issue[]): string {
  const columns: Array<keyof Issue> = [
    "run_date",
    "text_title",
    "text_path",
    "stable_id",
    "source_type",
    "source_url",
    "issue_category",
    "severity",
    "evidence",
    "recommended_fix",
    "status",
  ];
  const header = columns.join(",");
  const rows = issues.map((issue) => columns.map((column) => csvEscape(String(issue[column]))).join(","));
  return [header, ...rows].join("\n");
}

function parseIssueCsv(raw: string): Issue[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",");
  const map = new Map(header.map((h, i) => [h, i]));

  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return {
      run_date: cells[map.get("run_date") ?? -1] ?? "",
      text_title: cells[map.get("text_title") ?? -1] ?? "",
      text_path: cells[map.get("text_path") ?? -1] ?? "",
      stable_id: cells[map.get("stable_id") ?? -1] ?? "",
      source_type: (cells[map.get("source_type") ?? -1] as SourceType) ?? "unknown",
      source_url: cells[map.get("source_url") ?? -1] ?? "",
      issue_category: (cells[map.get("issue_category") ?? -1] as IssueCategory) ?? "formatting",
      severity: (cells[map.get("severity") ?? -1] as Severity) ?? "P3",
      evidence: cells[map.get("evidence") ?? -1] ?? "",
      recommended_fix: cells[map.get("recommended_fix") ?? -1] ?? "",
      status: (cells[map.get("status") ?? -1] as Status) ?? "open",
    };
  });
}

function addIssue(issues: Issue[], issue: Issue): void {
  if (
    issues.some(
      (existing) =>
        existing.text_path === issue.text_path &&
        existing.issue_category === issue.issue_category &&
        existing.severity === issue.severity &&
        existing.evidence === issue.evidence,
    )
  ) {
    return;
  }
  issues.push(issue);
}

async function analyzeText(
  text: TextRow,
  runDate: string,
  baseUrl: string,
  sourceCheck: boolean,
  seed: number,
): Promise<TextAnalysis> {
  const issues: Issue[] = [];
  const inferred = inferSource(text);
  const sourceUrl = inferred.sourceUrl;
  const sourceType = inferred.sourceType;
  const pageHtml = (await fetchWithTimeout(`${baseUrl}${text.fullPath}`)) ?? "";
  const articleHtml = extractArticle(pageHtml) || text.bodyHtml || "";

  const shared = {
    run_date: runDate,
    text_title: text.title,
    text_path: text.fullPath,
    stable_id: text.stableTextId,
    source_type: sourceType,
    source_url: sourceUrl,
    status: "open" as const,
  };

  if (/<img\b/i.test(articleHtml)) {
    addIssue(issues, {
      ...shared,
      issue_category: "formatting",
      severity: "P0",
      evidence: "Found <img> tag(s) in imported full text body.",
      recommended_fix: "Remove image tags and re-import the text-only source scope.",
    });
  }

  if (/&lt;\/?(strong|i|a|sup|span|div|p|section|h\d)\b/i.test(articleHtml)) {
    addIssue(issues, {
      ...shared,
      issue_category: "structure",
      severity: "P1",
      evidence: "Escaped HTML tags rendered as literal text (for example: &lt;strong&gt;).",
      recommended_fix: "Decode and sanitize source markup before save; render semantic tags as HTML, not escaped entities.",
    });
  }

  if (/(book_navbar|class=['"]tnav['"]|book-font-size-malleable|Project Gutenberg EBook)/i.test(articleHtml)) {
    addIssue(issues, {
      ...shared,
      issue_category: "styling",
      severity: "P2",
      evidence: "Source-site chrome/navigation artifacts are present in body content.",
      recommended_fix: "Strip source page furniture (nav bars, wrappers, front matter) and keep only the text body container.",
    });
  }

  const hrefMatches = [...articleHtml.matchAll(/href=['"]([^'"]+)['"]/gi)].map((m) => m[1]);
  const brokenCount = hrefMatches.filter((href) => {
    if (href.startsWith("#")) return false;
    if (href.startsWith("http://") || href.startsWith("https://")) return false;
    if (href.startsWith("/")) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    return true;
  }).length;
  if (brokenCount > 0) {
    addIssue(issues, {
      ...shared,
      issue_category: "structure",
      severity: "P2",
      evidence: `Found ${brokenCount} relative link(s) likely broken in local rendering context.`,
      recommended_fix: "Rewrite body links to absolute source URLs or strip non-essential navigation links during import.",
    });
  }

  if (/Project Gutenberg EBook of/i.test(articleHtml) && !new RegExp(text.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(articleHtml.slice(0, 6000))) {
    addIssue(issues, {
      ...shared,
      issue_category: "accuracy",
      severity: "P0",
      evidence: "Body begins with generic Gutenberg anthology/front matter instead of matching target text title.",
      recommended_fix: "Re-import from canonical text boundary for this work only (exclude anthology wrapper and unrelated sections).",
    });
  }

  let sourceMatches = 0;
  let sourceSegments = 0;
  let sourceChecked = false;

  if (sourceCheck && sourceUrl) {
    const sourceHtml = await fetchWithTimeout(sourceUrl, 20000);
    if (sourceHtml) {
      sourceChecked = true;
      const normalizedSource = normalizeText(sourceHtml);
      const segments = sampleSegments(text.bodyText || articleHtml, seed);
      sourceSegments = segments.length;
      for (const segment of segments) {
        if (normalizedSource.includes(segment)) {
          sourceMatches += 1;
        }
      }
      if (sourceSegments > 0 && sourceMatches <= 1) {
        addIssue(issues, {
          ...shared,
          issue_category: "accuracy",
          severity: "P0",
          evidence: `Source match check failed (${sourceMatches}/${sourceSegments} sampled segments found in source).`,
          recommended_fix: "Verify source mapping and text boundaries, then re-import and re-run spot comparison.",
        });
      }
    }
  }

  if (!sourceUrl) {
    addIssue(issues, {
      ...shared,
      issue_category: "proofreading",
      severity: "P3",
      evidence: "No explicit source URL available in metadata; source provenance inferred from content markers.",
      recommended_fix: "Store canonical source URL in metadata and expose it for QA verification.",
    });
  }

  return {
    text,
    inferredSourceType: sourceType,
    inferredSourceUrl: sourceUrl,
    issues,
    sourceChecked,
    sourceMatches,
    sourceSegments,
  };
}

function summarizeIssues(issues: Issue[]): {
  bySeverity: Record<Severity, number>;
  byCategory: Record<IssueCategory, number>;
  bySource: Record<SourceType, number>;
} {
  const bySeverity: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const byCategory: Record<IssueCategory, number> = {
    accuracy: 0,
    formatting: 0,
    structure: 0,
    styling: 0,
    proofreading: 0,
  };
  const bySource: Record<SourceType, number> = {
    eBible: 0,
    CCEL: 0,
    Sefaria: 0,
    Gutenberg: 0,
    other: 0,
    unknown: 0,
  };

  for (const issue of issues) {
    bySeverity[issue.severity] += 1;
    byCategory[issue.issue_category] += 1;
    bySource[issue.source_type] += 1;
  }

  return { bySeverity, byCategory, bySource };
}

function runIdFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}`;
}

function formatTableRow(columns: string[]): string {
  return `| ${columns.join(" | ")} |`;
}

function buildReport(params: {
  runId: string;
  runDate: string;
  reviewer: string;
  batchMode: "random" | "sequential";
  batchSize: number;
  selectedPaths: string[];
  analyses: TextAnalysis[];
  issues: Issue[];
  regressionSummary: string[];
  stateBefore: QaState;
  stateAfter: QaState;
}): string {
  const { bySeverity, byCategory, bySource } = summarizeIssues(params.issues);
  const p0p1 = params.issues.filter((issue) => issue.severity === "P0" || issue.severity === "P1");

  const fixImmediate = params.issues.filter((i) => i.severity === "P0" || i.severity === "P1");
  const fixNext = params.issues.filter((i) => i.severity === "P2");
  const fixBacklog = params.issues.filter((i) => i.severity === "P3");

  const perTextRows = params.issues.map((issue) =>
    formatTableRow([
      issue.text_title,
      issue.text_path,
      issue.issue_category,
      issue.severity,
      issue.source_type,
      issue.evidence.replace(/\|/g, "\\|"),
      issue.recommended_fix.replace(/\|/g, "\\|"),
      issue.status,
    ]),
  );

  const criticalRows = p0p1.map((issue) =>
    formatTableRow([
      issue.text_title,
      issue.text_path,
      issue.severity,
      issue.issue_category,
      issue.evidence.replace(/\|/g, "\\|"),
      issue.recommended_fix.replace(/\|/g, "\\|"),
    ]),
  );

  const sourceCheckStats = params.analyses.filter((a) => a.sourceChecked).length;
  const sourceCheckSkipped = params.analyses.length - sourceCheckStats;

  return [
    `# Stage 1 QA Run Report (${params.runId})`,
    "",
    "## Run metadata",
    `- run_date: ${params.runDate}`,
    `- reviewer: ${params.reviewer}`,
    `- batch_mode: ${params.batchMode}`,
    `- batch_size: ${params.batchSize}`,
    `- text_count_reviewed: ${params.selectedPaths.length}`,
    `- source_checks_completed: ${sourceCheckStats}`,
    `- source_checks_skipped: ${sourceCheckSkipped}`,
    `- state_before: runCount=${params.stateBefore.runCount}, sequentialOffset=${params.stateBefore.sequentialOffset}`,
    `- state_after: runCount=${params.stateAfter.runCount}, sequentialOffset=${params.stateAfter.sequentialOffset}`,
    "",
    "## Executive summary",
    `- Severity counts: P0=${bySeverity.P0}, P1=${bySeverity.P1}, P2=${bySeverity.P2}, P3=${bySeverity.P3}`,
    `- Category counts: accuracy=${byCategory.accuracy}, formatting=${byCategory.formatting}, structure=${byCategory.structure}, styling=${byCategory.styling}, proofreading=${byCategory.proofreading}`,
    `- Source family counts: eBible=${bySource.eBible}, CCEL=${bySource.CCEL}, Sefaria=${bySource.Sefaria}, Gutenberg=${bySource.Gutenberg}, other=${bySource.other}, unknown=${bySource.unknown}`,
    "",
    "## Critical findings (P0/P1)",
    criticalRows.length > 0
      ? [
          formatTableRow(["text_title", "text_path", "severity", "category", "evidence", "recommended_fix"]),
          formatTableRow(["---", "---", "---", "---", "---", "---"]),
          ...criticalRows,
        ].join("\n")
      : "No P0/P1 issues found in this run.",
    "",
    "## Per-text issue table",
    perTextRows.length > 0
      ? [
          formatTableRow(["text_title", "text_path", "issue_category", "severity", "source_type", "evidence", "recommended_fix", "status"]),
          formatTableRow(["---", "---", "---", "---", "---", "---", "---", "---"]),
          ...perTextRows,
        ].join("\n")
      : "No issues logged.",
    "",
    "## Fix queue",
    `- Immediate (P0/P1): ${fixImmediate.length}`,
    ...fixImmediate.map((i) => `  - ${i.text_path} [${i.severity}] ${i.issue_category}: ${i.evidence}`),
    `- Next pass (P2): ${fixNext.length}`,
    ...fixNext.map((i) => `  - ${i.text_path} [${i.severity}] ${i.issue_category}: ${i.evidence}`),
    `- Backlog (P3): ${fixBacklog.length}`,
    ...fixBacklog.map((i) => `  - ${i.text_path} [${i.severity}] ${i.issue_category}: ${i.evidence}`),
    "",
    "## Regression checks",
    ...(params.regressionSummary.length > 0 ? params.regressionSummary : ["- No prior fixed issues available for re-check."]),
    "",
    "## Open risks",
    "- Source URL coverage remains incomplete when source metadata is null.",
    "- Automated source matching is heuristic and should be supplemented by manual adjudication for flagged records.",
    "- This stage intentionally excludes visual polish and focuses only on import integrity.",
    "",
    "## Text paths covered",
    ...params.selectedPaths.map((p) => `- ${p}`),
    "",
  ].join("\n");
}

async function runRegressionChecks(baseUrl: string): Promise<string[]> {
  if (!fs.existsSync(MASTER_ISSUES_PATH)) {
    return [];
  }
  const existing = parseIssueCsv(fs.readFileSync(MASTER_ISSUES_PATH, "utf8"));
  const fixed = existing.filter((issue) => issue.status === "fixed");
  if (fixed.length === 0) {
    return [];
  }

  const sampleSize = Math.max(1, Math.ceil(fixed.length * 0.1));
  const selected = fixed.slice(0, sampleSize);
  const lines: string[] = [];

  for (const issue of selected) {
    const page = (await fetchWithTimeout(`${baseUrl}${issue.text_path}`)) ?? "";
    const article = extractArticle(page);
    let ok = true;
    if (issue.issue_category === "formatting" && /<img\b/i.test(article)) ok = false;
    if (issue.issue_category === "structure" && /&lt;\/?(strong|i|a|sup|span|div|p|section|h\d)\b/i.test(article)) ok = false;
    if (issue.issue_category === "styling" && /(book_navbar|class=['"]tnav['"]|book-font-size-malleable)/i.test(article)) ok = false;

    lines.push(`- ${issue.text_path}: ${ok ? "verified" : "regressed"} (${issue.issue_category})`);
  }

  return lines;
}

function ensureTemplate(): void {
  if (fs.existsSync(REPORT_TEMPLATE_PATH)) return;
  const template = [
    "# Stage 1 QA Report Template",
    "",
    "## Run metadata",
    "- run_date:",
    "- reviewer:",
    "- batch_size:",
    "- text_paths_covered:",
    "",
    "## Executive summary",
    "- severity_counts:",
    "- top_recurring_issue_types:",
    "",
    "## Critical findings (P0/P1)",
    "- include evidence + recommended fix for each",
    "",
    "## Per-text issue table",
    "- columns: run_date, text_title, text_path, stable_id, source_type, source_url, issue_category, severity, evidence, recommended_fix, status",
    "",
    "## Fix queue",
    "- Immediate (P0/P1)",
    "- Next pass (P2)",
    "- Backlog (P3)",
    "",
    "## Regression checks",
    "- at least 10% of previously fixed issues",
    "",
    "## Open risks",
    "- blockers, provenance gaps, ambiguous cases",
    "",
  ].join("\n");
  fs.writeFileSync(REPORT_TEMPLATE_PATH, template, "utf8");
}

async function main(): Promise<void> {
  ensureQaDirs();
  ensureTemplate();
  const args = parseArgs(process.argv.slice(2));

  const texts = await prisma.text.findMany({
    where: { ingestStatus: "READY", bodyHtml: { not: null }, bodyText: { not: null } },
    select: {
      stableTextId: true,
      title: true,
      fullPath: true,
      sourceUrl: true,
      bodyHtml: true,
      bodyText: true,
    },
    orderBy: [{ title: "asc" }],
  });

  if (texts.length === 0) {
    throw new Error("No READY full-text records found for QA.");
  }

  const state = loadState();
  const stateBefore: QaState = { ...state };
  const batchMode: "random" | "sequential" =
    args.mode === "auto" ? (state.runCount < 2 ? "random" : "sequential") : args.mode;

  const seed = args.seed ?? hashString(`${new Date().toISOString().slice(0, 10)}-${state.runCount}-${batchMode}`);
  const batch = pickBatch(texts, batchMode, args.batchSize, seed, state);
  const runDate = new Date().toISOString().slice(0, 10);

  const analyses: TextAnalysis[] = [];
  for (let i = 0; i < batch.length; i += 1) {
    const analysis = await analyzeText(batch[i], runDate, args.baseUrl, args.sourceCheck, seed + i);
    analyses.push(analysis);
  }

  const issues = analyses.flatMap((a) => a.issues);
  const runId = runIdFromDate(new Date());
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const runCsvPath = path.join(runDir, "issues.csv");
  const reportPath = path.join(runDir, "report.md");
  fs.writeFileSync(runCsvPath, `${issuesToCsv(issues)}\n`, "utf8");

  const regressionSummary = await runRegressionChecks(args.baseUrl);

  const report = buildReport({
    runId,
    runDate,
    reviewer: args.reviewer,
    batchMode,
    batchSize: batch.length,
    selectedPaths: batch.map((t) => t.fullPath),
    analyses,
    issues,
    regressionSummary,
    stateBefore,
    stateAfter: { runCount: state.runCount + 1, sequentialOffset: state.sequentialOffset },
  });
  fs.writeFileSync(reportPath, report, "utf8");

  const currentMaster = fs.existsSync(MASTER_ISSUES_PATH) ? parseIssueCsv(fs.readFileSync(MASTER_ISSUES_PATH, "utf8")) : [];
  const merged = [...currentMaster, ...issues];
  fs.writeFileSync(MASTER_ISSUES_PATH, `${issuesToCsv(merged)}\n`, "utf8");

  state.runCount += 1;
  saveState(state);

  console.log(`Stage 1 QA run complete: ${runId}`);
  console.log(`Batch mode: ${batchMode}`);
  console.log(`Texts reviewed: ${batch.length}`);
  console.log(`Issues logged: ${issues.length}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Run issues CSV: ${runCsvPath}`);
  console.log(`Master issues CSV: ${MASTER_ISSUES_PATH}`);
}

main()
  .catch((error) => {
    console.error("Stage 1 QA failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
