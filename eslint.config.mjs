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
    // rc-mvp: codice parcheggiato dal prune RC-only (vedi legacy/README.md)
    "legacy/**",
    // Dir di lavoro temporanea (gitignored): script usa-e-getta, non codice di
    // produzione — coerente con l'esclusione in tsconfig.json.
    "scratchpad/**",
  ]),
]);

export default eslintConfig;
