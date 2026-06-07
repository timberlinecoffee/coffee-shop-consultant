// TIM-2459: bulk-upload all verify-tim2459/* screenshots to TIM-2457 as
// attachments. Endpoint: POST /api/companies/:companyId/issues/:issueId/attachments
// (multipart, field "file").

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { REPO_ROOT } from "./shared.mjs";

const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const COMPANY = process.env.PAPERCLIP_COMPANY_ID;
const RUN_ID = process.env.PAPERCLIP_RUN_ID;
const TARGET_ISSUE = process.env.TARGET_ISSUE_ID; // TIM-2457 issue UUID

if (!API || !KEY || !COMPANY || !TARGET_ISSUE) {
  console.error("Missing env: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID / TARGET_ISSUE_ID");
  process.exit(2);
}

const ROOT = join(REPO_ROOT, "verify-tim2459");

function listFiles() {
  const out = [];
  for (const folder of readdirSync(ROOT)) {
    const full = join(ROOT, folder);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full)) {
      const ext = extname(f).toLowerCase();
      if (ext !== ".png" && ext !== ".json") continue;
      out.push({ folder, name: f, path: join(full, f) });
    }
  }
  return out;
}

async function upload(file) {
  const buf = readFileSync(file.path);
  const mime = file.name.endsWith(".png") ? "image/png" : "application/json";
  const tagged = `${file.folder}__${file.name}`;
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([buf], { type: mime }),
    tagged,
  );
  const res = await fetch(
    `${API}/api/companies/${COMPANY}/issues/${TARGET_ISSUE}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "X-Paperclip-Run-Id": RUN_ID,
      },
      body: fd,
    },
  );
  const body = await res.text();
  return { ok: res.ok, status: res.status, name: tagged, body: body.slice(0, 200) };
}

const files = listFiles();
console.log(`[upload] ${files.length} files to TIM-2457 issue ${TARGET_ISSUE}`);
let ok = 0;
let fail = 0;
for (const f of files) {
  const r = await upload(f);
  if (r.ok) {
    ok++;
    console.log(`  ✓ ${r.name}`);
  } else {
    fail++;
    console.log(`  ✗ ${r.name} (${r.status}) ${r.body}`);
  }
}
console.log(`[done] uploaded=${ok} failed=${fail}`);
process.exit(fail === 0 ? 0 : 1);
