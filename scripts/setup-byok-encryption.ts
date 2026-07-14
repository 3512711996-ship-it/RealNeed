import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
const keyName = "API_CREDENTIAL_ENCRYPTION_KEY";
const linePattern = new RegExp(`^${keyName}=.*$`, "m");
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existingLine = existing.match(linePattern)?.[0];

if (existingLine && existingLine !== `${keyName}=`) {
  console.info("BYOK encryption is already configured in .env. The key was not printed.");
  process.exit(0);
}

const newline = existing.includes("\r\n") ? "\r\n" : "\n";
const keyLine = `${keyName}=${randomBytes(32).toString("base64")}`;
const next = existingLine
  ? existing.replace(linePattern, keyLine)
  : `${existing}${existing && !existing.endsWith("\n") ? newline : ""}${keyLine}${newline}`;

writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });
console.info("BYOK encryption is configured in local .env. The key was not printed.");
