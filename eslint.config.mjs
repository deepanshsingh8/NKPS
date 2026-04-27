import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Module-boundary rules. After Phase 3.4+, the modules live in:
//   apps/website   — public marketing site
//   apps/cms       — content management (Phase 3.5)
//   apps/erp       — school operations (Phase 3.5)
//   packages/shared — code consumed by all of the above
//   src/cms, src/erp — legacy locations until Phase 3.5 extracts them
//
// Each module imports from itself + @nkps/shared only. ESLint catches
// peer-module imports so the productization story stays clean.
const moduleBoundaryRule = (forbidden) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: forbidden.map((m) => ({
        group: [`@/${m}/*`],
        message: `Cross-module import of @/${m}/* is forbidden here. If the code is genuinely shared, move it to @nkps/shared.`,
      })),
    },
  ],
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/node_modules/**",
    "next-env.d.ts",
  ]),
  // src/cms/ — only cms + shared (legacy location until 3.5)
  {
    files: ["src/cms/**/*.{ts,tsx,js,jsx}"],
    rules: moduleBoundaryRule(["website", "erp"]),
  },
  // src/erp/ — only erp + shared (legacy location until 3.5)
  {
    files: ["src/erp/**/*.{ts,tsx,js,jsx}"],
    rules: moduleBoundaryRule(["website", "cms"]),
  },
]);

export default eslintConfig;
