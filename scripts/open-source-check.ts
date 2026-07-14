import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];

const required = [
  "LICENSE",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "OPEN_SOURCE_RELEASE_CHECKLIST.md",
  "OPEN_SOURCE_BUGS_FOUND.md",
  "docker-compose.yml",
  ".env.example",
  ".env.production.example",
  ".gitignore",
  ".gitleaks.toml"
];
for (const file of required) if (!existsSync(path.join(root, file))) failures.push(`missing:${file}`);

const license = read("LICENSE");
if (!license.includes("GNU AFFERO GENERAL PUBLIC LICENSE") || !license.includes("TERMS AND CONDITIONS")) failures.push("license_not_canonical_agpl");

const example = read(".env.example");
for (const pattern of [/\bsk-[A-Za-z0-9_-]{16,}\b/, /\btvly-[A-Za-z0-9_-]{16,}\b/, /postgres(?:ql)?:\/\/[^\s]*@/i]) {
  if (pattern.test(example)) failures.push("env_example_contains_secret_like_value");
}

const ignored = read(".gitignore");
for (const entry of [".env", ".env.local", "logs/", "test-results/"]) {
  if (!ignored.includes(entry)) failures.push(`gitignore_missing:${entry}`);
}

const isReleaseExport = existsSync(path.join(root, "RELEASE_EXPORT.md"));
if (isReleaseExport) {
  for (const forbiddenPath of ["docs/tmp_pipeline_sources", "docs/generated", "docs/SETUP.md", "docs/USAGE.md", "docs/CARD_INDEX.md"]) {
    if (existsSync(path.join(root, forbiddenPath))) failures.push(`release_contains_non_realneed_docs:${forbiddenPath}`);
  }
}

const packageManifest = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
if (packageManifest.scripts?.["video:realneed"] && isReleaseExport) {
  failures.push("release_manifest_contains_workspace_only_video_command");
}

if (failures.length) {
  console.error(`Open-source check failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Open-source check: PASS");

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}
