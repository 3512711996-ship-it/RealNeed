import { prisma } from "@/lib/prisma";

async function main() {
  const updated = await prisma.sourceRecord.updateMany({
    where: {
      OR: [
        { origin: "UNTRUSTED_LEGACY_SOURCE" },
        { origin: "SEARCH_PROVIDER", provider: { not: "TAVILY" } },
        { origin: "SEARCH_PROVIDER", providerRequestId: null }
      ]
    },
    data: {
      origin: "UNTRUSTED_LEGACY_SOURCE",
      evidenceAvailability: "NO_EVIDENCE",
      evidenceStrength: "NOT_CLASSIFIED",
      sourceAnomaly: "UNTRUSTED_LEGACY_SOURCE"
    }
  });

  console.log(`quarantined=${updated.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
