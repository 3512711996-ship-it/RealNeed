import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const releaseEntries = [
  ".dockerignore",
  ".env.example",
  ".env.local.example",
  ".env.production.example",
  ".gitignore",
  ".gitleaks.toml",
  ".github",
  "app",
  "components",
  "deploy",
  "docs/architecture.md",
  "docs/byok-security.md",
  "docs/contributing.md",
  "docs/deployment.md",
  "docs/evidence-policy.md",
  "docs/provider-system.md",
  "docs/self-hosting.md",
  "lib",
  "prisma",
  "public/brand",
  "scripts/cleanup-scheduler.ts",
  "scripts/data-cleanup.ts",
  "scripts/db-backup.ts",
  "scripts/db-check.ts",
  "scripts/db-restore.ts",
  "scripts/legacy-sources-cleanup.ts",
  "scripts/open-source-check.ts",
  "scripts/prepare-open-source-release.ts",
  "scripts/production-preflight.ts",
  "scripts/setup-byok-encryption.ts",
  "scripts/smoke-production.ts",
  "scripts/sources-quarantine.ts",
  "scripts/start-production.ts",
  "scripts/test-alert.ts",
  "scripts/worker-status.ts",
  "tests",
  "worker",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "DEPLOYMENT.md",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.production.example.yml",
  "eslint.config.mjs",
  "LICENSE",
  "OPEN_SOURCE_BUGS_FOUND.md",
  "OPEN_SOURCE_RELEASE_CHECKLIST.md",
  "next-env.d.ts",
  "next.config.mjs",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "postcss.config.mjs",
  "PRIVACY.md",
  "PRODUCT_PRINCIPLES.md",
  "proxy.ts",
  "README.md",
  "SECURITY.md",
  "tailwind.config.ts",
  "tsconfig.json",
  "vitest.config.ts"
] as const;

const excludedPathFragments = [
  ".env",
  ".next",
  "node_modules",
  "logs",
  "test-results",
  "backups",
  "public/contact",
  "public/payments",
  "public/video",
  "00_Inbox",
  "10_AgentCenter"
];

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\btvly-[A-Za-z0-9_-]{16,}\b/,
  /postgres(?:ql)?:\/\/[^\s]*@/i
];

function main() {
  const outputArg = process.argv[2];
  const dryRun = process.env.REALNEED_RELEASE_DRY_RUN === "true";

  if (!outputArg) {
    throw new Error("Usage: npm run release:prepare -- <new-directory>");
  }

  const sourceRoot = path.resolve(process.cwd());
  const outputRoot = path.resolve(outputArg);
  assertSafeOutput(sourceRoot, outputRoot);

  const missing = releaseEntries.filter((entry) => !existsSync(path.join(sourceRoot, entry)));
  if (missing.length) throw new Error(`Release source is incomplete: ${missing.join(", ")}`);

  if (dryRun) {
    console.log(`Open-source release dry run: ${releaseEntries.length} allowlisted entries would be exported to ${outputRoot}`);
    return;
  }

  mkdirSync(outputRoot, { recursive: true });
  for (const entry of releaseEntries) {
    const source = path.join(sourceRoot, entry);
    const destination = path.join(outputRoot, entry);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true, errorOnExist: true });
  }

  writeFileSync(
    path.join(outputRoot, "RELEASE_EXPORT.md"),
    "# RealNeed Open-Source Export\n\nThis directory was created by `npm run release:prepare`. It intentionally excludes local credentials, databases, reports, logs, personal contact/payment assets, video exports, and the surrounding LifeOS vault. Run `npm ci`, `npm run open-source:check`, and a history-aware secret scan before publishing.\n",
    "utf8"
  );
  assertNoUnsafeFiles(outputRoot);
  console.log(`Open-source release created: ${outputRoot}`);
}

function assertSafeOutput(sourceRoot: string, outputRoot: string) {
  if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("The release output must be outside the current workspace.");
  }
  if (existsSync(outputRoot) && readdirSync(outputRoot).length > 0) {
    throw new Error("The release output directory already exists and is not empty. Refusing to overwrite it.");
  }
}

function assertNoUnsafeFiles(root: string) {
  for (const relativePath of walk(root)) {
    const normalized = relativePath.replaceAll("\\", "/");
    if (excludedPathFragments.some((fragment) => normalized === fragment || normalized.startsWith(`${fragment}/`))) {
      throw new Error(`Unsafe release path detected: ${normalized}`);
    }
    if (!isTextFile(normalized)) continue;
    const content = readFileSync(path.join(root, relativePath), "utf8");
    if (secretPatterns.some((pattern) => pattern.test(content))) {
      throw new Error(`Secret-like content detected in release export: ${normalized}`);
    }
  }
}

function walk(root: string, current = ""): string[] {
  const directory = path.join(root, current);
  return readdirSync(directory).flatMap((entry) => {
    const relative = path.join(current, entry);
    return statSync(path.join(root, relative)).isDirectory() ? walk(root, relative) : [relative];
  });
}

function isTextFile(file: string) {
  return /\.(?:md|ts|tsx|js|mjs|json|yml|yaml|css|svg|html|txt|toml)$/i.test(file) || path.basename(file).startsWith(".");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to prepare the open-source release.");
  process.exitCode = 1;
}
