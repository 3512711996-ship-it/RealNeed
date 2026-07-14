import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/env";
import { assertProductionConfiguration } from "@/lib/production-config";
import { logServerError } from "@/lib/safe-logger";
import { runPostgresCommand } from "@/lib/postgres-cli";

async function main() {
  assertProductionConfiguration("migration");
  const env = getServerEnv();
  if (!env.databaseUrl) throw Object.assign(new Error("DATABASE_URL_REQUIRED"), { code: "DATABASE_URL_REQUIRED" });
  const backupDir = path.resolve(env.backupDir ?? "./backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.join(backupDir, `realneed-${stamp}.dump`);
  await runPostgresCommand("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", output], env.databaseUrl);
  const checksum = createHash("sha256").update(await readFile(output)).digest("hex");
  await writeFile(`${output}.sha256`, `${checksum}  ${path.basename(output)}\n`, "utf8");
  console.log(`RealNeed database backup created: ${output}`);
}

main().catch((error) => {
  logServerError("database_backup_failed", error);
  process.exit(1);
});
