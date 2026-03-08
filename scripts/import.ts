import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

import { prisma } from "../lib/prisma";
import { REQUIRED_COLUMNS, type ImportSummary, type SheetRow } from "../types/importer";

const WEB_BIBLE_BOOKS: Record<string, { code: string; chapters: number; chapterDigits?: number }> = {
  "JEW-SCR-Genesis": { code: "GEN", chapters: 50 },
  "JEW-SCR-Exodus": { code: "EXO", chapters: 40 },
  "JEW-SCR-Leviticus": { code: "LEV", chapters: 27 },
  "JEW-SCR-Numbers": { code: "NUM", chapters: 36 },
  "JEW-SCR-Deuteronomy": { code: "DEU", chapters: 34 },
  "JEW-SCR-Joshua": { code: "JOS", chapters: 24 },
  "JEW-SCR-Judges": { code: "JDG", chapters: 21 },
  "JEW-SCR-Ruth": { code: "RUT", chapters: 4 },
  "JEW-SCR-1-Samuel": { code: "1SA", chapters: 31 },
  "JEW-SCR-2-Samuel": { code: "2SA", chapters: 24 },
  "JEW-SCR-1-Kings": { code: "1KI", chapters: 22 },
  "JEW-SCR-2-Kings": { code: "2KI", chapters: 25 },
  "JEW-SCR-1-Chronicles": { code: "1CH", chapters: 29 },
  "JEW-SCR-2-Chronicles": { code: "2CH", chapters: 36 },
  "JEW-SCR-Ezra": { code: "EZR", chapters: 10 },
  "JEW-SCR-Nehemiah": { code: "NEH", chapters: 13 },
  "JEW-SCR-Esther": { code: "EST", chapters: 10 },
  "JEW-SCR-Job": { code: "JOB", chapters: 42 },
  "JEW-SCR-Psalms": { code: "PSA", chapters: 150, chapterDigits: 3 },
  "JEW-SCR-Proverbs": { code: "PRO", chapters: 31 },
  "JEW-SCR-Ecclesiastes": { code: "ECC", chapters: 12 },
  "JEW-SCR-Song-of-Solomon": { code: "SNG", chapters: 8 },
  "JEW-SCR-Isaiah": { code: "ISA", chapters: 66 },
  "JEW-SCR-Jeremiah": { code: "JER", chapters: 52 },
  "JEW-SCR-Lamentations": { code: "LAM", chapters: 5 },
  "JEW-SCR-Ezekiel": { code: "EZK", chapters: 48 },
  "JEW-SCR-Daniel": { code: "DAN", chapters: 12 },
  "JEW-SCR-Hosea": { code: "HOS", chapters: 14 },
  "JEW-SCR-Joel": { code: "JOL", chapters: 3 },
  "JEW-SCR-Amos": { code: "AMO", chapters: 9 },
  "JEW-SCR-Obadiah": { code: "OBA", chapters: 1 },
  "JEW-SCR-Jonah": { code: "JON", chapters: 4 },
  "JEW-SCR-Micah": { code: "MIC", chapters: 7 },
  "JEW-SCR-Nahum": { code: "NAM", chapters: 3 },
  "JEW-SCR-Habakkuk": { code: "HAB", chapters: 3 },
  "JEW-SCR-Zephaniah": { code: "ZEP", chapters: 3 },
  "JEW-SCR-Haggai": { code: "HAG", chapters: 2 },
  "JEW-SCR-Zechariah": { code: "ZEC", chapters: 14 },
  "JEW-SCR-Malachi": { code: "MAL", chapters: 4 },
  "CHR-SCR-Gospel-of-Matthew": { code: "MAT", chapters: 28 },
  "CHR-SCR-Gospel-of-Mark": { code: "MRK", chapters: 16 },
  "CHR-SCR-Gospel-of-Luke": { code: "LUK", chapters: 24 },
  "CHR-SCR-Gospel-of-John": { code: "JHN", chapters: 21 },
  "CHR-SCR-Acts-of-the-Apostles": { code: "ACT", chapters: 28 },
  "CHR-SCR-Romans": { code: "ROM", chapters: 16 },
  "CHR-SCR-1-Corinthians": { code: "1CO", chapters: 16 },
  "CHR-SCR-2-Corinthians": { code: "2CO", chapters: 13 },
  "CHR-SCR-Galatians": { code: "GAL", chapters: 6 },
  "CHR-SCR-Ephesians": { code: "EPH", chapters: 6 },
  "CHR-SCR-Philippians": { code: "PHP", chapters: 4 },
  "CHR-SCR-Colossians": { code: "COL", chapters: 4 },
  "CHR-SCR-1-Thessalonians": { code: "1TH", chapters: 5 },
  "CHR-SCR-2-Thessalonians": { code: "2TH", chapters: 3 },
  "CHR-SCR-1-Timothy": { code: "1TI", chapters: 6 },
  "CHR-SCR-2-Timothy": { code: "2TI", chapters: 4 },
  "CHR-SCR-Titus": { code: "TIT", chapters: 3 },
  "CHR-SCR-Philemon": { code: "PHM", chapters: 1 },
  "CHR-SCR-1-Peter": { code: "1PE", chapters: 5 },
  "CHR-SCR-2-Peter": { code: "2PE", chapters: 3 },
  "CHR-SCR-1-John": { code: "1JN", chapters: 5 },
  "CHR-SCR-2-John": { code: "2JN", chapters: 1 },
  "CHR-SCR-3-John": { code: "3JN", chapters: 1 },
  "CHR-SCR-Revelation": { code: "REV", chapters: 22 },
  "CHR-PAT-Book-of-Hebrews": { code: "HEB", chapters: 13 },
  "CHR-PAT-Epistle-of-James": { code: "JAS", chapters: 5 },
  "CHR-PAT-Epistle-of-Jude": { code: "JUD", chapters: 1 },
};

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function asRow(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => {
    row[h] = (values[i] ?? "").trim();
  });
  return row;
}

function normalizePath(fullPath: string): string {
  const trimmed = fullPath.trim();
  if (!trimmed.startsWith("/texts/")) {
    throw new Error(`Invalid Suggested_Hierarchical_Path (must start with /texts/): ${fullPath}`);
  }
  return trimmed.replace(/\/+$/, "");
}

function deriveParentPath(fullPath: string): string | null {
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length <= 2) return null; // /texts/{slug}

  return `/${parts.slice(0, -1).join("/")}`;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractAnchoredSection(html: string, anchorRaw: string): string | null {
  const anchor = decodeURIComponent(anchorRaw.trim());
  if (!anchor) return null;

  const headingAnchors: Array<{ index: number; id: string }> = [];
  const headingAnchorRe = /<h[1-6][^>]*>[\s\S]*?<a[^>]+(?:id|name)=["']([^"']+)["'][^>]*>/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingAnchorRe.exec(html)) !== null) {
    headingAnchors.push({ index: headingMatch.index, id: headingMatch[1] });
  }

  const headingIdx = headingAnchors.findIndex((h) => h.id.toLowerCase() === anchor.toLowerCase());
  if (headingIdx >= 0) {
    const start = headingAnchors[headingIdx].index;
    const end = headingIdx + 1 < headingAnchors.length ? headingAnchors[headingIdx + 1].index : html.length;
    return html.slice(start, end);
  }

  const genericRe = new RegExp(`<[^>]+(?:id|name)=["']${escapeRegex(anchor)}["'][^>]*>`, "i");
  const genericMatch = genericRe.exec(html);
  if (!genericMatch || typeof genericMatch.index !== "number") {
    return null;
  }

  const start = genericMatch.index;
  const nextHeading = headingAnchors.find((h) => h.index > start);
  const end = nextHeading ? nextHeading.index : html.length;
  return html.slice(start, end);
}

function isGutenbergPg10Url(url: string): boolean {
  return /gutenberg\.org\/cache\/epub\/10\/pg10-images\.html/i.test(url);
}

function resolveSourceUrl(row: SheetRow): string {
  const mapping = WEB_BIBLE_BOOKS[row.Stable_Text_ID.trim()];
  if (mapping) {
    const digits = mapping.chapterDigits ?? 2;
    return `https://eBible.org/engwebu/${mapping.code}${String(1).padStart(digits, "0")}.htm`;
  }
  return (row.Direct_Full_Text_URL || "").trim();
}

function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function findOpeningDivById(html: string, elementId: string): { tagStart: number; tagEnd: number } | null {
  const regex = new RegExp(`<div\\b[^>]*\\bid=["']${escapeRegex(elementId)}["'][^>]*>`, "i");
  const match = regex.exec(html);
  if (!match || typeof match.index !== "number") return null;
  const tagStart = match.index;
  const tagEnd = tagStart + match[0].length;
  return { tagStart, tagEnd };
}

function extractDivById(html: string, elementId: string): string | null {
  const opening = findOpeningDivById(html, elementId);
  if (!opening) return null;

  const divTagRe = /<\/?div\b[^>]*>/gi;
  divTagRe.lastIndex = opening.tagStart;

  let depth = 0;
  let start = -1;
  let end = -1;
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = divTagRe.exec(html)) !== null) {
    const tag = tagMatch[0];
    const isClosing = /^<\s*\/div/i.test(tag);
    const tagIndex = tagMatch.index;

    if (!isClosing) {
      depth += 1;
      if (tagIndex === opening.tagStart) {
        start = tagIndex;
      }
    } else {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        end = divTagRe.lastIndex;
        break;
      }
    }
  }

  if (start < 0 || end < 0 || end <= start) return null;
  return html.slice(start, end);
}

function cleanFetchedHtml(rawHtml: string): string {
  let html = extractBodyHtml(rawHtml);

  // CCEL pages wrap the actual text in #theText; prefer that block to avoid reader chrome.
  const ccelCore = extractDivById(html, "theText");
  if (ccelCore) {
    html = ccelCore;
  }

  // Remove non-content blocks that pollute extracted text.
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, " ")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/&laquo;?\s*prev[\s\S]{0,240}?next\s*&raquo;?/gi, " ")
    .replace(/«\s*prev[\s\S]{0,240}?next\s*»/gi, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/contents\s+loading[\s.\u2026:-]*/gi, " ")
    .replace(/«\s*prev[\s\S]{0,160}?next\s*»/gi, " ");

  return html.trim();
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/contents\s+loading[\s.\u2026:-]*/gi, " ")
    .replace(/&laquo;?\s*prev[\s\S]{0,240}?next\s*&raquo;?/gi, " ")
    .replace(/«\s*prev[\s\S]{0,160}?next\s*»/gi, " ")
    .replace(/\btable of contents\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInvalidFetchedContent(html: string, text: string): boolean {
  const normalized = `${html}\n${text}`.toLowerCase();
  const markers = [
    "no document found",
    "all search options",
    "collections/texts perseus",
    "search for documents in",
    "userutils::makejsprefs()",
    "var page_author =",
    "var page_work =",
  ];
  const hasMarker = markers.some((marker) => normalized.includes(marker));
  if (hasMarker) return true;

  // Guard against very short boilerplate captures from blocked or invalid source pages.
  if (text.trim().length < 800 && normalized.includes("perseus")) {
    return true;
  }

  if (text.trim().length < 200) {
    return true;
  }

  return false;
}

function resolveLocalWebDir(): string {
  const configured = (process.env.WEB_LOCAL_HTML_DIR || "").trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.resolve(process.cwd(), "eng-webbe_html");
}

function localChapterPath(code: string, chapter: number, chapterDigits = 2): string {
  const ch = String(chapter).padStart(chapterDigits, "0");
  return path.join(resolveLocalWebDir(), `${code}${ch}.htm`);
}

async function readChapterFromLocal(code: string, chapter: number, chapterDigits = 2): Promise<string | null> {
  const chapterPath = localChapterPath(code, chapter, chapterDigits);
  if (!fs.existsSync(chapterPath)) return null;
  return fs.readFileSync(chapterPath, "utf8");
}

async function fetchChapterFromRemote(code: string, chapter: number, chapterDigits = 2): Promise<string | null> {
  const ch = String(chapter).padStart(chapterDigits, "0");
  const chapterUrl = `https://eBible.org/engwebu/${code}${ch}.htm`;
  const response = await fetch(chapterUrl);
  if (!response.ok) return null;
  return response.text();
}

async function fetchWebBookHtml(code: string, chapters: number, chapterDigits = 2): Promise<string | null> {
  const parts: string[] = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    let chapterHtml = await readChapterFromLocal(code, chapter, chapterDigits);
    if (!chapterHtml) {
      chapterHtml = await fetchChapterFromRemote(code, chapter, chapterDigits);
    }
    if (!chapterHtml) return null;

    const body = extractBodyHtml(chapterHtml);
    parts.push(`<section data-book-code="${code}" data-chapter="${chapter}">${body}</section>`);
  }
  return parts.join("\n");
}

function flattenTextSegments(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenTextSegments(item));
  }
  return [];
}

async function fetchSefariaRefHtml(sourceUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!(host === "sefaria.org" || host === "www.sefaria.org")) {
    return null;
  }

  const ref = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!ref) return null;

  const apiUrl = `https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?lang=bi&commentary=0`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    error?: string;
    text?: unknown;
    he?: unknown;
    ref?: string;
  };
  if (payload.error) return null;

  const englishSegments = flattenTextSegments(payload.text);
  const hebrewSegments = flattenTextSegments(payload.he);
  const segments = englishSegments.length > 0 ? englishSegments : hebrewSegments;
  if (segments.length === 0) return null;

  const body = segments
    .map((segment, idx) => `<p data-segment="${idx + 1}">${escapeHtml(segment)}</p>`)
    .join("\n");
  return `<section data-source="sefaria" data-ref="${escapeHtml(payload.ref || ref)}">${body}</section>`;
}

function normalizeIngestStatus(status: string): string {
  return status.trim().toUpperCase().replace(/\s+/g, "_");
}

function effectiveIngestStatus(row: SheetRow): string {
  if (WEB_BIBLE_BOOKS[row.Stable_Text_ID.trim()]) {
    return "READY";
  }
  return normalizeIngestStatus(row.Ingest_Readiness);
}

function canFetchRow(row: SheetRow): boolean {
  const status = effectiveIngestStatus(row);
  if (status === "READY") {
    return true;
  }

  return false;
}

async function loadSheetRows(): Promise<SheetRow[]> {
  const sheetId = getEnv("GOOGLE_SHEET_ID");
  const range = process.env.GOOGLE_SHEET_RANGE || "Sheet1!A:Z";
  const keyPath = getEnv("GOOGLE_SERVICE_ACCOUNT_JSON_PATH");

  const resolvedPath = path.resolve(process.cwd(), keyPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Google service account file not found: ${resolvedPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const values = result.data.values;

  if (!values || values.length < 2) {
    throw new Error("Sheet has no data rows.");
  }

  const headers = values[0].map((v) => String(v).trim());
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  return values.slice(1).map((row) => asRow(headers, row.map((v) => String(v))) as unknown as SheetRow);
}

async function upsertParentStub(parentPath: string, summary: ImportSummary): Promise<number> {
  const existing = await prisma.text.findUnique({ where: { fullPath: parentPath }, select: { id: true } });
  if (existing) return existing.id;

  const slug = parentPath.split("/").filter(Boolean).at(-1) || "parent";
  const stableTextId = `STUB-${slug}-${Date.now()}`;

  const created = await prisma.text.create({
    data: {
      stableTextId,
      title: slug.replace(/-/g, " "),
      slug,
      fullPath: parentPath,
      tradition: "Shared",
      tier: "Unclassified",
      ingestStatus: "PLANNED_EXPANSION",
      hierarchyLevel: 1,
      summary: "Auto-generated parent stub",
    },
    select: { id: true },
  });

  summary.parentStubs += 1;
  return created.id;
}

async function maybeFetchText(row: SheetRow): Promise<{ bodyHtml: string | null; bodyText: string | null; ok: boolean }> {
  const isReady = canFetchRow(row);
  const sourceUrl = resolveSourceUrl(row);

  if (!isReady || !sourceUrl) {
    return { bodyHtml: null, bodyText: null, ok: false };
  }

  try {
    const mapping = WEB_BIBLE_BOOKS[row.Stable_Text_ID.trim()];
    if (mapping) {
      const webHtml = await fetchWebBookHtml(mapping.code, mapping.chapters, mapping.chapterDigits ?? 2);
      if (!webHtml) return { bodyHtml: null, bodyText: null, ok: false };
      const text = webHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return { bodyHtml: webHtml, bodyText: text, ok: true };
    }

    const sefariaHtml = await fetchSefariaRefHtml(sourceUrl);
    if (sefariaHtml) {
      const text = cleanExtractedText(sefariaHtml.replace(/<[^>]+>/g, " "));
      if (isInvalidFetchedContent(sefariaHtml, text)) {
        return { bodyHtml: null, bodyText: null, ok: false };
      }
      return { bodyHtml: sefariaHtml, bodyText: text, ok: true };
    }

    const parsedUrl = new URL(sourceUrl);
    const fragment = parsedUrl.hash ? parsedUrl.hash.slice(1) : "";
    const fetchUrl = fragment ? sourceUrl.slice(0, sourceUrl.indexOf("#")) : sourceUrl;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return { bodyHtml: null, bodyText: null, ok: false };

    let html = await response.text();
    if (fragment) {
      const sectionHtml = extractAnchoredSection(html, fragment);
      if (!sectionHtml) {
        return { bodyHtml: null, bodyText: null, ok: false };
      }
      html = sectionHtml;
    }

    const cleanedHtml = cleanFetchedHtml(html);
    const text = cleanExtractedText(cleanedHtml.replace(/<[^>]+>/g, " "));
    if (isInvalidFetchedContent(cleanedHtml, text)) {
      return { bodyHtml: null, bodyText: null, ok: false };
    }

    return { bodyHtml: cleanedHtml, bodyText: text, ok: true };
  } catch {
    return { bodyHtml: null, bodyText: null, ok: false };
  }
}

function asHierarchyLevel(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (parsed !== 1 && parsed !== 2) {
    return 1;
  }
  return parsed;
}

function parseMaxFetch(): number {
  const raw = process.env.IMPORT_MAX_FETCH;
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.POSITIVE_INFINITY;
  return parsed;
}

function parseSkipExisting(): boolean {
  const raw = (process.env.IMPORT_SKIP_EXISTING || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function parseOnlyStableIds(): Set<string> | null {
  const raw = (process.env.IMPORT_ONLY_STABLE_IDS || "").trim();
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  return new Set(values);
}

function sourcePriority(row: SheetRow): number {
  const mapping = WEB_BIBLE_BOOKS[row.Stable_Text_ID.trim()];
  if (mapping) return 0;
  return 1;
}

async function run(): Promise<void> {
  const summary: ImportSummary = {
    totalRows: 0,
    upserts: 0,
    parentStubs: 0,
    fullTextSuccesses: 0,
    fullTextFailures: 0,
    fetchesSkipped: 0,
    metadataOnlyPages: 0,
  };

  const rows = await loadSheetRows();
  const onlyStableIds = parseOnlyStableIds();
  const activeRows = onlyStableIds ? rows.filter((r) => onlyStableIds.has(r.Stable_Text_ID.trim())) : rows;
  summary.totalRows = activeRows.length;

  const maxFetches = parseMaxFetch();
  const skipExisting = parseSkipExisting();
  let remainingFetches = maxFetches;

  const pathSet = new Set<string>();
  const idSet = new Set<string>();

  for (const row of activeRows) {
    const stableId = row.Stable_Text_ID.trim();
    const fullPath = normalizePath(row.Suggested_Hierarchical_Path);

    if (idSet.has(stableId)) {
      throw new Error(`Duplicate Stable_Text_ID in sheet payload: ${stableId}`);
    }
    idSet.add(stableId);

    if (pathSet.has(fullPath)) {
      throw new Error(`Duplicate Suggested_Hierarchical_Path in sheet payload: ${fullPath}`);
    }
    pathSet.add(fullPath);
  }

  // Pass 1: upsert level-1 rows.
  for (const row of activeRows.filter((r) => asHierarchyLevel(r.Hierarchy_Level) === 1).sort((a, b) => sourcePriority(a) - sourcePriority(b))) {
    const fullPath = normalizePath(row.Suggested_Hierarchical_Path);
    let fetchResult = { bodyHtml: null as string | null, bodyText: null as string | null, ok: false };
    let attemptedFetch = false;
    const resolvedSourceUrl = resolveSourceUrl(row);
    const hasUrl = resolvedSourceUrl;
    const isReady = canFetchRow(row);
    let shouldFetch = isReady && Boolean(hasUrl);

    if (shouldFetch && skipExisting) {
      const existing = await prisma.text.findUnique({
        where: { stableTextId: row.Stable_Text_ID.trim() },
        select: { bodyHtml: true, bodyText: true },
      });
      if (existing?.bodyHtml || existing?.bodyText) {
        shouldFetch = false;
      }
    }

    if (shouldFetch && remainingFetches > 0) {
      attemptedFetch = true;
      fetchResult = await maybeFetchText(row);
      remainingFetches -= 1;
    } else if (shouldFetch && remainingFetches <= 0) {
      summary.fetchesSkipped += 1;
    }

    await prisma.text.upsert({
      where: { stableTextId: row.Stable_Text_ID.trim() },
      create: {
        stableTextId: row.Stable_Text_ID.trim(),
        title: row.Canonical_Display_Title.trim(),
        slug: row.Site_Slug.trim(),
        fullPath,
        tradition: row.Tradition.trim(),
        tier: row.Unified_Tier_Label.trim(),
        genre: row.Genre?.trim() || null,
        sourceUrl: resolvedSourceUrl || null,
        bodyHtml: fetchResult.bodyHtml,
        bodyText: fetchResult.bodyText,
        rightsStatus: row.Rights_Status?.trim() || null,
        ingestStatus: effectiveIngestStatus(row),
        hierarchyLevel: 1,
        alternateTitles: row.Alternate_Titles?.trim() || null,
        estimatedDate: row.Estimated_Date?.trim() || null,
        citationUnit: row.Citation_Unit?.trim() || null,
        citationExample: row.Citation_Example?.trim() || null,
        summary: row.Summary?.trim() || null,
      },
      update: {
        title: row.Canonical_Display_Title.trim(),
        slug: row.Site_Slug.trim(),
        fullPath,
        tradition: row.Tradition.trim(),
        tier: row.Unified_Tier_Label.trim(),
        genre: row.Genre?.trim() || null,
        sourceUrl: resolvedSourceUrl || null,
        rightsStatus: row.Rights_Status?.trim() || null,
        ingestStatus: effectiveIngestStatus(row),
        hierarchyLevel: 1,
        alternateTitles: row.Alternate_Titles?.trim() || null,
        estimatedDate: row.Estimated_Date?.trim() || null,
        citationUnit: row.Citation_Unit?.trim() || null,
        citationExample: row.Citation_Example?.trim() || null,
        summary: row.Summary?.trim() || null,
        ...(fetchResult.ok ? { bodyHtml: fetchResult.bodyHtml, bodyText: fetchResult.bodyText } : {}),
      },
    });

    summary.upserts += 1;
    if (fetchResult.ok) summary.fullTextSuccesses += 1;
    else if (attemptedFetch && isReady && hasUrl) summary.fullTextFailures += 1;
    else summary.metadataOnlyPages += 1;
  }

  // Pass 2: upsert level-2 rows with parent resolution.
  for (const row of activeRows.filter((r) => asHierarchyLevel(r.Hierarchy_Level) === 2).sort((a, b) => sourcePriority(a) - sourcePriority(b))) {
    const fullPath = normalizePath(row.Suggested_Hierarchical_Path);
    const parentPath = deriveParentPath(fullPath);
    if (!parentPath) {
      throw new Error(`Hierarchy level 2 row has no parent path: ${row.Stable_Text_ID}`);
    }

    const parentId = await upsertParentStub(parentPath, summary);
    let fetchResult = { bodyHtml: null as string | null, bodyText: null as string | null, ok: false };
    let attemptedFetch = false;
    const resolvedSourceUrl = resolveSourceUrl(row);
    const hasUrl = resolvedSourceUrl;
    const isReady = canFetchRow(row);
    let shouldFetch = isReady && Boolean(hasUrl);

    if (shouldFetch && skipExisting) {
      const existing = await prisma.text.findUnique({
        where: { stableTextId: row.Stable_Text_ID.trim() },
        select: { bodyHtml: true, bodyText: true },
      });
      if (existing?.bodyHtml || existing?.bodyText) {
        shouldFetch = false;
      }
    }

    if (shouldFetch && remainingFetches > 0) {
      attemptedFetch = true;
      fetchResult = await maybeFetchText(row);
      remainingFetches -= 1;
    } else if (shouldFetch && remainingFetches <= 0) {
      summary.fetchesSkipped += 1;
    }

    await prisma.text.upsert({
      where: { stableTextId: row.Stable_Text_ID.trim() },
      create: {
        stableTextId: row.Stable_Text_ID.trim(),
        parentId,
        title: row.Canonical_Display_Title.trim(),
        slug: row.Site_Slug.trim(),
        fullPath,
        tradition: row.Tradition.trim(),
        tier: row.Unified_Tier_Label.trim(),
        genre: row.Genre?.trim() || null,
        sourceUrl: resolvedSourceUrl || null,
        bodyHtml: fetchResult.bodyHtml,
        bodyText: fetchResult.bodyText,
        rightsStatus: row.Rights_Status?.trim() || null,
        ingestStatus: effectiveIngestStatus(row),
        hierarchyLevel: 2,
        alternateTitles: row.Alternate_Titles?.trim() || null,
        estimatedDate: row.Estimated_Date?.trim() || null,
        citationUnit: row.Citation_Unit?.trim() || null,
        citationExample: row.Citation_Example?.trim() || null,
        summary: row.Summary?.trim() || null,
      },
      update: {
        parentId,
        title: row.Canonical_Display_Title.trim(),
        slug: row.Site_Slug.trim(),
        fullPath,
        tradition: row.Tradition.trim(),
        tier: row.Unified_Tier_Label.trim(),
        genre: row.Genre?.trim() || null,
        sourceUrl: resolvedSourceUrl || null,
        rightsStatus: row.Rights_Status?.trim() || null,
        ingestStatus: effectiveIngestStatus(row),
        hierarchyLevel: 2,
        alternateTitles: row.Alternate_Titles?.trim() || null,
        estimatedDate: row.Estimated_Date?.trim() || null,
        citationUnit: row.Citation_Unit?.trim() || null,
        citationExample: row.Citation_Example?.trim() || null,
        summary: row.Summary?.trim() || null,
        ...(fetchResult.ok ? { bodyHtml: fetchResult.bodyHtml, bodyText: fetchResult.bodyText } : {}),
      },
    });

    summary.upserts += 1;
    if (fetchResult.ok) summary.fullTextSuccesses += 1;
    else if (attemptedFetch && isReady && hasUrl) summary.fullTextFailures += 1;
    else summary.metadataOnlyPages += 1;
  }

  console.log("Import summary:");
  console.table(summary);
}

run()
  .catch((error) => {
    console.error("Import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
