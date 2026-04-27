import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Module ownership rules: each module can import from itself + @nkps/shared,
// but never from a peer module. Enforces the website/cms/erp/shared split
// so the codebase can be productized as standalone deployments.
//
// `src/app/` is the consumer layer (glue) and is NOT restricted — Next.js
// route handlers can import from any module. Cross-cutting admin endpoints
// (e.g. /api/admin/dashboard) live here and need to span both modules.
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
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // src/website/ — only website + shared
  {
    files: ["src/website/**/*.{ts,tsx,js,jsx}"],
    rules: moduleBoundaryRule(["cms", "erp"]),
  },
  // src/cms/ — only cms + shared
  {
    files: ["src/cms/**/*.{ts,tsx,js,jsx}"],
    rules: moduleBoundaryRule(["website", "erp"]),
  },
  // src/erp/ — only erp + shared
  {
    files: ["src/erp/**/*.{ts,tsx,js,jsx}"],
    rules: moduleBoundaryRule(["website", "cms"]),
  },
  // src/shared/ — only shared (cannot reach into any module)
  {
    files: ["src/shared/**/*.{ts,tsx,js,jsx}"],
    rules: moduleBoundaryRule(["website", "cms", "erp"]),
  },
]);

export default eslintConfig;
