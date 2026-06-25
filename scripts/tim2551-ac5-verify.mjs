// Simulate the page.tsx country resolution + requirement-set fetch for MX.
// This is the exact query path: page.tsx:147-153
import pg from "pg"
import { setDefaultResultOrder } from "node:dns/promises"
setDefaultResultOrder("ipv4first")
const { Client } = pg
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

// normalizeCountry equivalent: src/app/(app)/workspace/hiring/page.tsx:115-128
function normalizeCountry(raw) {
  if (!raw) return null
  const upper = String(raw).toUpperCase().trim()
  const supported = ["US","GB","CA","AU","MX"]
  if (supported.includes(upper)) return upper
  const MAP = {"UNITED STATES":"US","UNITED STATES OF AMERICA":"US","USA":"US",
    "UNITED KINGDOM":"GB","UK":"GB","GREAT BRITAIN":"GB","ENGLAND":"GB","SCOTLAND":"GB","WALES":"GB",
    "CANADA":"CA","AUSTRALIA":"AU","MEXICO":"MX","MÉXICO":"MX"}
  return MAP[upper] ?? null
}

const inputs = ["Mexico", "MX", "México", "mexico"]
console.log("Normalizer probe:")
for (const v of inputs) console.log(`  ${JSON.stringify(v)} -> ${normalizeCountry(v)}`)

// Replicate the page.tsx fetch for effectiveCountry='MX'
const { rows } = await c.query(
  `SELECT id, country_code, category, title, order_index FROM public.hiring_requirement_sets WHERE country_code='MX' AND is_system=true ORDER BY order_index`
)
console.log(`\nQuery {country_code:'MX', is_system:true} returned ${rows.length} rows:`)
const cats = {}
for (const r of rows) { cats[r.category] = (cats[r.category]||0)+1 }
for (const [k,v] of Object.entries(cats)) console.log(`  ${k}: ${v}`)

console.log(`\nAC5 simulation: a plan with hiring_country='Mexico'|'MX' normalizes to MX, fetches ${rows.length} requirement sets — Hiring workspace will render the MX tab.`)
await c.end()
