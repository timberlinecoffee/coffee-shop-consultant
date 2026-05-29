// Standalone config for `npm run lint:normalize` (TIM-1356).
// Runs ONLY the require-normalized-ai-output rule so the AI-content gate is
// fast and independent of the main lint config. Wired into CI; a violation
// fails the PR merge.
//
// The next/react-hooks/typescript-eslint plugins are registered with NO rules
// enabled. They exist solely so the inline `eslint-disable` directives already
// present in source resolve to a known rule (otherwise ESLint errors with
// "Definition for rule '…' was not found"). Only our rule actually runs.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import requireNormalizedAiOutput from "./eslint-rules/require-normalized-ai-output.mjs";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.js", "scripts/**/*.mjs"],
    ignores: ["**/*.test.*", "**/__tests__/**", ".next/**", "node_modules/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: {
      tcs: { rules: { "require-normalized-ai-output": requireNormalizedAiOutput } },
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: { "tcs/require-normalized-ai-output": "error" },
  },
];
