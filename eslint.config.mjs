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
  // TIM-3236 (TIM-3229.E): money-field guard for workspace surface — raw
  // <input type="number"> with money props and bare-$ template literals must
  // use <MoneyInput>/<MoneyDisplay>/useCurrency() helpers instead.
  {
    files: ["src/app/(app)/workspace/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx,mjs}", "**/*.spec.{ts,tsx,mjs}"],
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
        {
          selector:
            "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value='number']):has(JSXAttribute[name.name=/^(?:aria-label|name|placeholder)$/][value.value=/(?:price|cost|fee|revenue|cogs|salary|wage|rent|opex|capex|deposit|expense|amount)/i])",
          message:
            "Use <MoneyInput> from @/components/ui/money-input instead of a raw <input type=\"number\"> for money fields (TIM-3229).",
        },
        {
          selector:
            "JSXExpressionContainer > TemplateLiteral[quasis.0.value.raw=/^\\$+/]",
          message:
            "Use <MoneyDisplay> or useCurrency().format* instead of a bare-$ template literal for money display (TIM-3229). See @/components/ui/money-display.",
        },
      ],
    },
  },
  // TIM-3236 (TIM-3229.E): money-field guard — plan route and shared component
  // surfaces. Mirrors the workspace rules above without the toFixed restriction.
  // Excluded: test files, src/lib/credits/packs.ts, src/lib/ai/** (not in scope).
  {
    files: [
      "src/app/plan/**/*.{ts,tsx}",
      "src/components/{equipment,buildout,location-lease,launch-plan,business-plan,menu-pricing,workspace,hiring}/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx,mjs}", "**/*.spec.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value='number']):has(JSXAttribute[name.name=/^(?:aria-label|name|placeholder)$/][value.value=/(?:price|cost|fee|revenue|cogs|salary|wage|rent|opex|capex|deposit|expense|amount)/i])",
          message:
            "Use <MoneyInput> from @/components/ui/money-input instead of a raw <input type=\"number\"> for money fields (TIM-3229).",
        },
        {
          selector:
            "JSXExpressionContainer > TemplateLiteral[quasis.0.value.raw=/^\\$+/]",
          message:
            "Use <MoneyDisplay> or useCurrency().format* instead of a bare-$ template literal for money display (TIM-3229). See @/components/ui/money-display.",
        },
      ],
    },
  },
  // TIM-3288: Voice Mandate guard — em-dash (U+2014) is forbidden in email
  // template string literals and JSX text. Use '. ' or ': ' instead.
  // Mirrors TIM-3236 no-restricted-syntax pattern.
  {
    files: ["src/lib/email/templates/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/—/]",
          message:
            "Em-dash not allowed in email templates (TIM-1537 Voice Mandate). Use '. ' or ': ' instead of ' — '.",
        },
        {
          selector: "JSXText[value=/—/]",
          message:
            "Em-dash not allowed in email templates (TIM-1537 Voice Mandate). Use '. ' or ': ' instead of ' — '.",
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
