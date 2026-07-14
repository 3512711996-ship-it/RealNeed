import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { assertProductionConfiguration, verifyProductionDependencies } from "@/lib/production-config";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/safe-logger";

async function main() {
  assertProductionConfiguration("web");
  await verifyProductionDependencies();
  await prisma.$disconnect();

  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" }
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main().catch(async (error) => {
  logServerError("production_web_start_failed", error);
  await prisma.$disconnect();
  process.exit(1);
});
