import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { google, sheets_v4 } from "googleapis";

type ChangeRow = {
  Record_ID: string;
  Canonical_Display_Title: string;
  Original_Ingest_Readiness: string;
  New_Ingest_Readiness: string;
  Direct_Full_Text_URL: string;
  New_Direct_Full_Text_URL_Note: string;
};

type ConservativeDecision = {
  status: "Ready" | "Blocked" | "Needs review";
  note: string;
  reason: string;
};

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((v) => v.trim());
}

function parseChangesCsv(csvPath: string): ChangeRow[] {
  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) throw new Error("CSV has no data rows.");
  const start = lines[0].startsWith("Record_ID,") ? 0 : 1;
  const header = parseCsvLine(lines[start]);
  const required = [
    "Record_ID",
    "Canonical_Display_Title",
    "Original_Ingest_Readiness",
    "New_Ingest_Readiness",
    "Direct_Full_Text_URL",
    "New_Direct_Full_Text_URL_Note",
  ];
  for (const key of required) {
    if (!header.includes(key)) throw new Error(`CSV missing header: ${key}`);
  }

  const rows: ChangeRow[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < header.length) continue;
    const obj = Object.fromEntries(header.map((h, idx) => [h, fields[idx] ?? ""])) as ChangeRow;
    rows.push(obj);
  }
  return rows;
}

function isSearchLike(url: URL): boolean {
  const p = url.pathname.toLowerCase();
  const q = url.search.toLowerCase();
  return p.includes("/search") || p.endsWith("/search.htm") || q.includes("search=") || q.includes("?q=") || q.includes("&q=");
}

function evaluateConservative(urlRaw: string): ConservativeDecision {
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return {
      status: "Blocked",
      note: "Invalid URL format. Provide a direct text URL with clear reuse rights.",
      reason: "invalid_url",
    };
  }

  const host = url.hostname.toLowerCase();
  const pathLower = url.pathname.toLowerCase();

  if (isSearchLike(url)) {
    return {
      status: "Blocked",
      note: "URL points to a search/discovery page, not a direct text page. Provide a direct text URL with clear reuse rights.",
      reason: "search_page",
    };
  }

  if (host.includes("archive.org")) {
    return {
      status: "Blocked",
      note: "Archive listing/search pages are not accepted for import. Provide a direct text URL with explicit reuse license.",
      reason: "archive_ambiguous",
    };
  }

  if (host === "www.gutenberg.org" || host === "gutenberg.org") {
    if (pathLower.startsWith("/files/") || pathLower.startsWith("/ebooks/") || pathLower.startsWith("/cache/epub/")) {
      return {
        status: "Ready",
        note: "Project Gutenberg direct text URL. Reuse allowed under Project Gutenberg terms; keep source attribution in metadata.",
        reason: "gutenberg_direct",
      };
    }
    return {
      status: "Needs review",
      note: "Project Gutenberg URL detected but not a standard direct text path. Verify the exact text endpoint before import.",
      reason: "gutenberg_non_direct",
    };
  }

  if (host === "www.sefaria.org" || host === "sefaria.org") {
    return {
      status: "Needs review",
      note: "Sefaria licensing is version-specific (CC/public-domain varies). Confirm specific version license before import/rehosting.",
      reason: "sefaria_version_specific",
    };
  }

  if (host === "www.perseus.tufts.edu" || host === "perseus.tufts.edu") {
    return {
      status: "Needs review",
      note: "Perseus rights and use terms are mixed by resource. Confirm reusable text rights for the exact page before import.",
      reason: "perseus_needs_confirmation",
    };
  }

  if (host === "www.sacred-texts.com" || host === "sacred-texts.com") {
    return {
      status: "Needs review",
      note: "Sacred-texts includes mixed rights content. Confirm the specific page is reusable/public-domain before import.",
      reason: "sacred_texts_mixed",
    };
  }

  return {
    status: "Needs review",
    note: "Source host not auto-approved by conservative policy. Confirm direct text rights before import.",
    reason: "unknown_host",
  };
}

function columnToA1(colIndexZeroBased: number): string {
  let n = colIndexZeroBased + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function getSheetsClient() {
  const keyPath = path.resolve(process.cwd(), getEnv("GOOGLE_SERVICE_ACCOUNT_JSON_PATH"));
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function run() {
  const csvPath = process.argv[2] || "C:\\Users\\clint\\Downloads\\ingest_review_changes_summary.csv";
  const apply = process.argv.includes("--apply");
  const outputPath =
    process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ||
    "C:\\Users\\clint\\Downloads\\ingest_review_changes_corrected.csv";

  const incoming = parseChangesCsv(csvPath);
  const conservative = incoming.map((r) => {
    const decision = evaluateConservative(r.Direct_Full_Text_URL);
    return {
      ...r,
      Conservative_Ingest_Readiness: decision.status,
      Conservative_Direct_Full_Text_URL_Note: decision.note,
      Conservative_Reason: decision.reason,
    };
  });

  const outHeaders = [
    "Record_ID",
    "Canonical_Display_Title",
    "Original_Ingest_Readiness",
    "New_Ingest_Readiness",
    "Conservative_Ingest_Readiness",
    "Direct_Full_Text_URL",
    "New_Direct_Full_Text_URL_Note",
    "Conservative_Direct_Full_Text_URL_Note",
    "Conservative_Reason",
  ];
  const escaped = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const outLines = [outHeaders.join(",")];
  for (const row of conservative) {
    outLines.push(
      [
        row.Record_ID,
        row.Canonical_Display_Title,
        row.Original_Ingest_Readiness,
        row.New_Ingest_Readiness,
        row.Conservative_Ingest_Readiness,
        row.Direct_Full_Text_URL,
        row.New_Direct_Full_Text_URL_Note,
        row.Conservative_Direct_Full_Text_URL_Note,
        row.Conservative_Reason,
      ]
        .map(escaped)
        .join(","),
    );
  }
  fs.writeFileSync(outputPath, `${outLines.join("\n")}\n`, "utf8");

  const summary = {
    incoming_rows: incoming.length,
    conservative_ready: conservative.filter((r) => r.Conservative_Ingest_Readiness === "Ready").length,
    conservative_blocked: conservative.filter((r) => r.Conservative_Ingest_Readiness === "Blocked").length,
    conservative_needs_review: conservative.filter((r) => r.Conservative_Ingest_Readiness === "Needs review").length,
  };
  console.log("Conservative CSV generated:");
  console.log(outputPath);
  console.table(summary);

  if (!apply) {
    console.log("Dry run only. Use --apply to update Google Sheet.");
    return;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getEnv("GOOGLE_SHEET_ID");
  const configuredRange = process.env.GOOGLE_SHEET_RANGE || "'Master Ingest List'!A:Z";
  const range = configuredRange.replace(/A:Z$/i, "A:ZZ");

  const readRes = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = readRes.data.values || [];
  if (values.length < 2) throw new Error("Sheet is empty or missing headers.");

  const headers = values[0].map((v) => String(v).trim());
  const idCol = headers.indexOf("Record_ID");
  const readinessCol = headers.indexOf("Ingest_Readiness");
  const noteCandidates = ["Direct_Full_Text_URL_Note", "Direct_Full_Text_URL Note", "Direct Full Text URL Note"];
  const noteCol = noteCandidates.map((name) => headers.indexOf(name)).find((idx) => idx >= 0) ?? -1;
  if (idCol < 0 || readinessCol < 0) {
    throw new Error("Required sheet columns missing: Record_ID / Ingest_Readiness");
  }

  const recordToRowNum = new Map<string, number>();
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    const id = String(row[idCol] ?? "").trim();
    if (id) recordToRowNum.set(id, i + 1); // 1-based sheet row index
  }

  const sheetName = range.includes("!") ? range.split("!")[0] : "'Master Ingest List'";
  const data: sheets_v4.Schema$ValueRange[] = [];
  let matched = 0;

  for (const row of conservative) {
    const rowNum = recordToRowNum.get(row.Record_ID.trim());
    if (!rowNum) continue;
    matched += 1;
    const readinessA1 = `${sheetName}!${columnToA1(readinessCol)}${rowNum}`;
    data.push({ range: readinessA1, values: [[row.Conservative_Ingest_Readiness]] });
    if (noteCol >= 0) {
      const noteA1 = `${sheetName}!${columnToA1(noteCol)}${rowNum}`;
      data.push({ range: noteA1, values: [[row.Conservative_Direct_Full_Text_URL_Note]] });
    }
  }

  if (data.length === 0) {
    console.log("No matching Record_ID rows found in sheet. No updates applied.");
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });

  console.log("Google Sheet updated.");
  console.table({
    matched_record_ids: matched,
    written_cells: data.length,
    notes_written: noteCol >= 0 ? "yes" : "no (note column not found)",
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
