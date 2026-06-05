// TIM-2342: Curated industry-benchmark dataset surfaced into the narrative
// prompt as the only "approved" source for benchmark-tagged claims.
//
// Investor critique on TIM-2315 item #6 part 1: the narrative invented numbers
// that read authoritatively. The fix is twofold: (a) plan_state.ground_truth
// covers user-typed and computed numbers, and (b) THIS file covers
// industry-standard benchmarks the lender expects to see cited honestly. Any
// number that isn't in either of those is by definition an estimate and gets
// hedged + flagged for review.
//
// Designed to grow: TIM-1698 (public industry data benchmark plumbing) will
// hook into this loader and replace the embedded JSON with a real upstream
// feed. Until then, the JSON is a small, sourced, curated dataset.
//
// Relative imports (no @/ aliases) so node:test can load this module without
// the Next.js path-alias resolver — mirrors plan-state.ts and entities.ts.

// Embed the JSON synchronously so the module has no async init step. The
// Node ESM "with" import attribute is gated on flag — using require() through
// createRequire keeps the bundler happy and works in node:test runs too.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RAW = require("./benchmarks.json") as any;

// ── Public types ─────────────────────────────────────────────────────────────

export interface IndustryBenchmark {
  key: string;
  label: string;
  value_range: string;
  unit: string;
  source: string;
  note: string;
  applicable_sections: string[];
}

export interface BenchmarkDataset {
  version: string;
  benchmarks: IndustryBenchmark[];
}

// ── Loader ──────────────────────────────────────────────────────────────────

let cached: BenchmarkDataset | null = null;

export function loadBenchmarks(): BenchmarkDataset {
  if (cached) return cached;
  const list: IndustryBenchmark[] = Array.isArray(RAW?.benchmarks)
    ? RAW.benchmarks.filter((b: unknown): b is IndustryBenchmark => {
        if (!b || typeof b !== "object") return false;
        const x = b as Record<string, unknown>;
        return (
          typeof x.key === "string" &&
          typeof x.label === "string" &&
          typeof x.value_range === "string" &&
          typeof x.unit === "string"
        );
      })
    : [];
  cached = { version: String(RAW?.version ?? "unknown"), benchmarks: list };
  return cached;
}

// ── Section-aware filter ────────────────────────────────────────────────────

// Surface only the benchmarks that are relevant to the current section. Cuts
// prompt-token overhead by ~60% for short sections (e.g. depreciation only
// needs a couple of benchmarks). Falls back to the full list when no
// section-key filter is provided or the section is unrecognized.

export function benchmarksForSection(sectionKey: string | null): IndustryBenchmark[] {
  const ds = loadBenchmarks();
  if (!sectionKey) return ds.benchmarks;
  const filtered = ds.benchmarks.filter((b) => b.applicable_sections.includes(sectionKey));
  // If the section has no targeted benchmarks, fall through to the universal
  // set so the LLM still has fallback context rather than nothing.
  return filtered.length > 0 ? filtered : ds.benchmarks;
}

// ── Prompt block serializer ─────────────────────────────────────────────────

// The narrative LLM consumes this block as the ONLY approved source for
// benchmark-tagged claims. If a benchmark isn't in this block, the LLM is
// forbidden from citing it as benchmark — it has to either tag it estimate
// (and hedge it) or omit the figure.

export function formatBenchmarksForPrompt(
  sectionKey: string | null,
): string {
  const ds = loadBenchmarks();
  const items = benchmarksForSection(sectionKey);
  const lines: string[] = [];
  lines.push(`Industry Benchmarks — the ONLY approved source for <num src="benchmark">…</num> claims.`);
  lines.push(`Dataset version: ${ds.version}. If a benchmark you want to cite is not in this list, do NOT tag it benchmark — tag it estimate and hedge it.`);
  lines.push("");
  for (const b of items) {
    lines.push(`- ${b.label}: ${b.value_range} ${b.unit}`);
    if (b.note) lines.push(`  · ${b.note}`);
    lines.push(`  · Source: ${b.source}`);
  }
  return lines.join("\n");
}
