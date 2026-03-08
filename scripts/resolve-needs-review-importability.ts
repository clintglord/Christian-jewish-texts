import "dotenv/config";

import path from "node:path";
import { google } from "googleapis";

type Decision = {
  status: "Ready" | "Needs review";
  note?: string;
  reason: string;
};

type CacheItem = {
  ok: boolean;
  status: number;
  body: string;
};

const fetchCache = new Map<string, CacheItem>();
const sefariaLicenseCache = new Map<string, string | null>();

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function colToA1(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function fetchHtml(url: string): Promise<CacheItem> {
  if (fetchCache.has(url)) return fetchCache.get(url)!;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);
    const body = await resp.text();
    const item: CacheItem = { ok: resp.ok, status: resp.status, body };
    fetchCache.set(url, item);
    return item;
  } catch {
    const item: CacheItem = { ok: false, status: 0, body: "" };
    fetchCache.set(url, item);
    return item;
  }
}

function isSearchLike(u: URL): boolean {
  const p = u.pathname.toLowerCase();
  const q = u.search.toLowerCase();
  return p.includes("/search") || p.endsWith("search.htm") || q.includes("?q=") || q.includes("&q=") || q.includes("search=");
}

async function getSefariaLicense(refPath: string): Promise<string | null> {
  if (sefariaLicenseCache.has(refPath)) return sefariaLicenseCache.get(refPath)!;
  const apiUrl = `https://www.sefaria.org/api/texts/${encodeURIComponent(refPath)}?lang=bi`;
  const res = await fetchHtml(apiUrl);
  if (!res.ok || !res.body) {
    sefariaLicenseCache.set(refPath, null);
    return null;
  }
  try {
    const json = JSON.parse(res.body) as Record<string, unknown>;
    if (typeof json.error === "string" && json.error.length > 0) {
      sefariaLicenseCache.set(refPath, null);
      return null;
    }
    const candidates = [json.license, json.heLicense, json.versionLicense, json.heVersionLicense];
    const license =
      candidates.find((v) => typeof v === "string" && String(v).trim().length > 0)?.toString().trim() ?? null;
    sefariaLicenseCache.set(refPath, license);
    return license;
  } catch {
    sefariaLicenseCache.set(refPath, null);
    return null;
  }
}

function hasPerseusCcBySa(html: string): boolean {
  return /This work is licensed under a Creative Commons Attribution-ShareAlike 3\.0 United States License/i.test(html);
}

function isLikelyNoTextPage(html: string): boolean {
  return /No document found|All Search Options|collections\/texts\s+Perseus/i.test(html);
}

async function decide(urlRaw: string): Promise<Decision> {
  let u: URL;
  try {
    u = new URL(urlRaw);
  } catch {
    return { status: "Needs review", reason: "invalid_url" };
  }

  const host = u.hostname.toLowerCase();
  const pathLower = u.pathname.toLowerCase();

  if (isSearchLike(u)) return { status: "Needs review", reason: "search_or_discovery_page" };

  if (host === "ebible.org" || host === "www.ebible.org") {
    if (/^\/engwebu\/[a-z0-9]{3}\d{2,3}\.htm$/i.test(pathLower)) {
      return {
        status: "Ready",
        note: "Direct eBible chapter URL and known import path. Ready for import.",
        reason: "ebible_direct",
      };
    }
    return { status: "Needs review", reason: "ebible_non_direct" };
  }

  if (host === "www.gutenberg.org" || host === "gutenberg.org") {
    const isDirect = pathLower.startsWith("/files/") || pathLower.startsWith("/ebooks/") || pathLower.startsWith("/cache/epub/");
    if (!isDirect) return { status: "Needs review", reason: "gutenberg_non_direct" };
    const page = await fetchHtml(urlRaw);
    if (!page.ok) return { status: "Needs review", reason: "gutenberg_unreachable" };
    if (!/Project Gutenberg/i.test(page.body)) return { status: "Needs review", reason: "gutenberg_unverified_content" };
    return {
      status: "Ready",
      note: "Project Gutenberg direct text URL. Reuse allowed under Project Gutenberg terms; retain source attribution.",
      reason: "gutenberg_direct_verified",
    };
  }

  if (host === "www.sefaria.org" || host === "sefaria.org") {
    const refPath = decodeURIComponent(u.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));
    if (!refPath) return { status: "Needs review", reason: "sefaria_empty_ref" };
    const license = await getSefariaLicense(refPath);
    if (!license) return { status: "Needs review", reason: "sefaria_license_missing" };
    if (/public domain|cc0|cc-by|cc by|creative commons/i.test(license)) {
      return {
        status: "Ready",
        note: `Sefaria version license detected (${license}). Ready subject to license obligations (attribution/share-alike where required).`,
        reason: "sefaria_license_ok",
      };
    }
    return { status: "Needs review", reason: "sefaria_license_unrecognized" };
  }

  if (host === "www.perseus.tufts.edu" || host === "perseus.tufts.edu") {
    if (!(pathLower.includes("/hopper/text") && u.search.toLowerCase().includes("doc="))) {
      return { status: "Needs review", reason: "perseus_non_direct" };
    }
    const page = await fetchHtml(urlRaw);
    if (!page.ok) return { status: "Needs review", reason: "perseus_unreachable" };
    if (isLikelyNoTextPage(page.body)) return { status: "Needs review", reason: "perseus_no_text" };
    if (!hasPerseusCcBySa(page.body)) return { status: "Needs review", reason: "perseus_license_not_detected" };
    return {
      status: "Ready",
      note: "Perseus direct text page with explicit CC BY-SA 3.0 license notice detected. Attribution + share-alike required.",
      reason: "perseus_direct_ccbysa",
    };
  }

  if (host === "www.sacred-texts.com" || host === "sacred-texts.com") {
    const page = await fetchHtml(urlRaw);
    if (!page.ok) return { status: "Needs review", reason: "sacred_texts_unreachable" };
    if (isLikelyNoTextPage(page.body)) return { status: "Needs review", reason: "sacred_texts_not_text_page" };
    if (/public domain/i.test(page.body)) {
      return {
        status: "Ready",
        note: "Direct sacred-texts page with public-domain signal detected. Ready for import.",
        reason: "sacred_texts_pd_signal",
      };
    }
    return { status: "Needs review", reason: "sacred_texts_rights_unclear" };
  }

  if (host === "ccel.org" || host === "www.ccel.org") {
    const page = await fetchHtml(urlRaw);
    if (!page.ok) return { status: "Needs review", reason: "ccel_unreachable" };
    if (/id=["']theText["']/i.test(page.body)) {
      return {
        status: "Ready",
        note: "Direct CCEL text page detected (core #theText block available). Verify item-level rights metadata before publication.",
        reason: "ccel_direct_text_detected",
      };
    }
    return { status: "Needs review", reason: "ccel_not_text_page" };
  }

  return { status: "Needs review", reason: "host_not_supported" };
}

async function run() {
  const apply = process.argv.includes("--apply");
  const sheetId = getEnv("GOOGLE_SHEET_ID");
  const keyPath = path.resolve(process.cwd(), getEnv("GOOGLE_SERVICE_ACCOUNT_JSON_PATH"));
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const range = "'Master Ingest List'!A:ZZ";
  const read = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const values = read.data.values || [];
  if (values.length < 2) throw new Error("Sheet empty");
  const headers = values[0].map((h) => String(h).trim());
  const idx = (name: string) => headers.indexOf(name);
  const idCol = idx("Record_ID");
  const titleCol = idx("Canonical_Display_Title");
  const readinessCol = idx("Ingest_Readiness");
  const urlCol = idx("Direct_Full_Text_URL");
  const noteCol = idx("Direct_Full_Text_URL_Note");
  if ([idCol, titleCol, readinessCol, urlCol, noteCol].some((v) => v < 0)) {
    throw new Error("Missing required columns");
  }

  const updates: Array<{ range: string; values: string[][] }> = [];
  const stats: Record<string, number> = {
    scanned: 0,
    ready_marked: 0,
    kept_needs_review: 0,
  };
  const reasonCounts = new Map<string, number>();

  for (let r = 1; r < values.length; r += 1) {
    const row = values[r] || [];
    const readiness = String(row[readinessCol] || "").trim();
    if (readiness !== "Needs review") continue;
    const id = String(row[idCol] || "").trim();
    const title = String(row[titleCol] || "").trim();
    const url = String(row[urlCol] || "").trim();
    if (!id || !url) {
      stats.kept_needs_review += 1;
      continue;
    }

    stats.scanned += 1;
    const d = await decide(url);
    reasonCounts.set(d.reason, (reasonCounts.get(d.reason) || 0) + 1);
    if (d.status !== "Ready") {
      stats.kept_needs_review += 1;
      continue;
    }

    stats.ready_marked += 1;
    const rowNum = r + 1;
    updates.push({
      range: `'Master Ingest List'!${colToA1(readinessCol)}${rowNum}`,
      values: [["Ready"]],
    });
    updates.push({
      range: `'Master Ingest List'!${colToA1(noteCol)}${rowNum}`,
      values: [[d.note ?? "Verified importability and licensing signals."]],
    });

    if (!apply) {
      console.log(`${id} | ${title} | Ready | ${d.reason}`);
    }
  }

  if (apply && updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    });
  }

  const reasonObj = Object.fromEntries([...reasonCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  console.log(JSON.stringify({ ...stats, updates_written: apply ? updates.length : 0, apply }, null, 2));
  console.log("Reason breakdown:");
  console.table(reasonObj);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

