import { cleanupLegacySources } from "@/lib/legacy-source-cleanup";
import { prisma } from "@/lib/prisma";

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const exportPath = getArgValue("--export");

  if (args.has("--help")) {
    console.log("Usage:");
    console.log("  npm run sources:legacy:dry-run");
    console.log("  npm run sources:legacy:purge -- --execute");
    console.log("  tsx scripts/legacy-sources-cleanup.ts --export logs/legacy.csv");
    return;
  }

  const result = await cleanupLegacySources(prisma, { execute, exportPath });
  console.log(JSON.stringify(result, null, 2));

  if (!execute && result.candidateCount > 0) {
    console.log("Dry run only. Re-run with --execute to delete these quarantined legacy sources after reviewing the CSV export.");
  }
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Legacy source cleanup failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
