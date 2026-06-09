import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // TIM-2478 (F3 + F7): keep user-visible precision in workspace tabs
  // consistent by routing through src/lib/formatters.ts. Bare `.toFixed(N)`
  // inside JSX is the entry point the helpers replace, so forbid it there.
  // Compute / formatter / hook code outside JSX is unaffected.
  {
    files: ["src/app/(app)/workspace/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXElement CallExpression[callee.property.name='toFixed']",
          message:
            "Do not call .toFixed() inside workspace JSX — route through src/lib/formatters.ts (fmtPct / formatMinor / formatRatioToOne / progressPct).",
        },
        {
          selector:
            "JSXFragment CallExpression[callee.property.name='toFixed']",
          message:
            "Do not call .toFixed() inside workspace JSX — route through src/lib/formatters.ts (fmtPct / formatMinor / formatRatioToOne / progressPct).",
        },
      ],
    },
  },
  // TIM-2573 (parent TIM-2555): client-reachable trees cannot import Node
  // built-ins. Turbopack refuses `node:*` in client chunks — broke prod under
  // TIM-2474 → benchmarks.ts → node:module → TIM-2546 (6h prod outage). Gate
  // both the `node:*` URL form and bare-name builtins (`fs`, `path`, `module`,
  // `crypto`, `os`, `stream`, `child_process`, etc.) because Turbopack treats
  // them the same way. Scope intentionally narrow: the two trees that ship to
  // the browser bundle directly. Lib modules that are imported INTO these
  // trees (e.g. business-plan/benchmarks.ts) are guarded by the
  // `no-node-imports-client.test.mjs` pin test — the ESLint rule cannot
  // statically detect transitive reach without a custom plugin (deferred).
  {
    files: [
      "src/app/(app)/workspace/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "Client-reachable code cannot import Node built-ins (broke prod via TIM-2474 → benchmarks.ts → node:module → TIM-2546).",
            },
          ],
          paths: [
            // Bare-name Node built-ins. Turbopack refuses these in client
            // chunks the same way it refuses the `node:` URL form.
            "assert",
            "buffer",
            "child_process",
            "cluster",
            "crypto",
            "dgram",
            "dns",
            "events",
            "fs",
            "fs/promises",
            "http",
            "http2",
            "https",
            "module",
            "net",
            "os",
            "path",
            "perf_hooks",
            "process",
            "querystring",
            "readline",
            "stream",
            "string_decoder",
            "tls",
            "tty",
            "url",
            "util",
            "v8",
            "vm",
            "worker_threads",
            "zlib",
          ].map((name) => ({
            name,
            message:
              "Client-reachable code cannot import Node built-ins (broke prod via TIM-2474 → benchmarks.ts → node:module → TIM-2546). Use the `node:` URL form only in server-only modules.",
          })),
        },
      ],
    },
  },
]);

export default eslintConfig;
