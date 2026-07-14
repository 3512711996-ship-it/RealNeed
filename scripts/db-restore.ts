import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/env";
import { logServerError } from "@/lib/safe-logger";
import { runPostgresCommand } from "@/lib/postgres-cli";

async function main() {
  if (process.env.RESTORE_CONFIRM !== "I_UNDERSTAND_THIS_OVERWRITES_DATABASE") {
    throw Object.assign(new Error("RESTORE_CONFIRM_REQUIRED"), { code: "RESTORE_CONFIRM_REQUIRED" });
  }
  const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!backupPath) throw Object.assign(new Error("BACKUP_PATH_REQUIRED"), { code: "BACKUP_PATH_REQUIRED" });
  const env = getServerEnv();
  if (!env.databaseUrl) throw Object.assign(new Error("DATABASE_URL_REQUIRED"), { code: "DATABASE_URL_REQUIRED" });
  await verifyChecksum(backupPath);
  await runPostgresCommand(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", backupPath],
    env.databaseUrl
  );
  console.log(`RealNeed database restore completed from: ${backupPath}`);
}

async function verifyChecksum(backupPath: string) {
  const checksumPath = `${backupPath}.sha256`;
  const [backup, checksumFile] = await Promise.all([readFile(backupPath), readFile(checksumPath, "utf8")]);
  const expected = checksumFile.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(backup).digest("hex");
  if (!expected || expected !== actual) throw Object.assign(new Error("BACKUP_CHECKSUM_MISMATCH"), { code: "BACKUP_CHECKSUM_MISMATCH" });
}

main().catch((error) => {
  logServerError("database_restore_failed", error);
  process.exit(1);
});
