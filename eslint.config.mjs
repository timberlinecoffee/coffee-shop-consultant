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
]);

export default eslintConfig;
