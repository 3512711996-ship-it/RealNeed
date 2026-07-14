import { prisma } from "@/lib/prisma";

async function main() {
  const [judgments, jobs, failedJobs, reports, activeLinks, deletedWithActiveLinks, missingRecovery, invalidSearchProviderSources, untrustedSources] = await Promise.all([
    prisma.ideaJudgmentRecord.count(),
    prisma.job.count(),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.deepDiveReport.count(),
    prisma.reportAccessLink.count({ where: { status: "ACTIVE" } }),
    prisma.reportAccessLink.count({
      where: {
        status: "ACTIVE",
        deepDiveReport: { judgment: { deletedAt: { not: null } } }
      }
    }),
    prisma.ideaJudgmentRecord.count({ where: { recoveryTokenHash: null, deletedAt: null } }),
    prisma.sourceRecord.count({
      where: {
        origin: "SEARCH_PROVIDER",
        OR: [{ provider: { not: "TAVILY" } }, { providerRequestId: null }]
      }
    }),
    prisma.sourceRecord.count({ where: { origin: "UNTRUSTED_LEGACY_SOURCE" } })
  ]);
  const sequenceMismatches = await countJobSequenceMismatches();

  console.log("RealNeed DB check");
  console.log(`judgments=${judgments}`);
  console.log(`jobs=${jobs}`);
  console.log(`failedJobs=${failedJobs}`);
  console.log(`deepDiveReports=${reports}`);
  console.log(`activeLinks=${activeLinks}`);
  console.log(`deletedReportsWithActiveLinks=${deletedWithActiveLinks}`);
  console.log(`missingRecoveryTokenHash=${missingRecovery}`);
  console.log(`invalidSearchProviderSources=${invalidSearchProviderSources}`);
  console.log(`untrustedLegacySources=${untrustedSources}`);
  console.log(`jobSequenceMismatches=${sequenceMismatches}`);

  if (deletedWithActiveLinks > 0 || missingRecovery > 0 || invalidSearchProviderSources > 0 || sequenceMismatches > 0) {
    process.exitCode = 1;
  }
}

async function countJobSequenceMismatches() {
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      nextEventSequence: true,
      events: {
        orderBy: { sequence: "desc" },
        take: 1,
        select: { sequence: true }
      }
    }
  });

  return jobs.filter((job) => (job.events[0]?.sequence ?? 0) !== job.nextEventSequence).length;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
