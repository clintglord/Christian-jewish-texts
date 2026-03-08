#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function normalizeDatabaseUrl(url) {
  if (!url) return url;
  let out = url.replace(/channel_binding=require/gi, "channel_binding=disable");
  out = out.replace(/channel_binding=prefer/gi, "channel_binding=disable");
  if (!/channel_binding=/i.test(out)) {
    out += (out.includes("?") ? "&" : "?") + "channel_binding=disable";
  }
  return out;
}

function resolveRunner(cwd) {
  const runtimeCompiled = path.join(cwd, ".codex-tmp", "runtime", "scripts", "import.js");
  if (fs.existsSync(runtimeCompiled)) return runtimeCompiled;
  const codexTmp = path.join(cwd, ".codex-tmp", "scripts", "import.js");
  if (fs.existsSync(codexTmp)) return codexTmp;
  throw new Error("No runnable import JS found (.codex-tmp/runtime/scripts/import.js missing).");
}

async function main() {
  const projectRoot = "C:\\dev\\jewish-christian-text-library";
  const cwd = projectRoot;
  const envFile = path.join(cwd, ".env");
  const envFromFile = loadDotEnv(envFile);
  const runner = resolveRunner(cwd);

  const merged = { ...process.env, ...envFromFile };
  merged.DATABASE_URL = normalizeDatabaseUrl(merged.DATABASE_URL || "");
  merged.PGCHANNELBINDING = "disable";
  merged.IMPORT_MAX_FETCH = process.env.IMPORT_MAX_FETCH || envFromFile.IMPORT_MAX_FETCH || "10";
  merged.IMPORT_SKIP_EXISTING = process.env.IMPORT_SKIP_EXISTING || envFromFile.IMPORT_SKIP_EXISTING || "1";

  console.log(`Running import via ${runner}`);
  console.log(`IMPORT_MAX_FETCH=${merged.IMPORT_MAX_FETCH}, IMPORT_SKIP_EXISTING=${merged.IMPORT_SKIP_EXISTING}`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner], {
      cwd,
      env: merged,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Import runner exited with code ${code}`));
    });
  });
}

main().catch((err) => {
  console.error("import-safe failed:", err.message);
  process.exitCode = 1;
});
