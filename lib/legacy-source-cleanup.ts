import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Prisma } from "@prisma/client";

export type LegacySourceCleanupOptions = {
  execute: boolean;
  exportPath?: string;
  now?: Date;
};

export type LegacySourceCleanupResult = {
  execute: boolean;
  candidateCount: number;
  deletedCount: number;
  affectedJudgmentCount: number;
  exportPath: string;
  sample: Array<{
    id: string;
    reportCode: string;
    origin: string;
    evidenceAvailability: string;
    title: string | null;
    url: string;
  }>;
};

type SourceRecordWithReportCode = {
  id: string;
  judgmentId: string;
  originalUrl: string;
  origin: string;
  provider: string | null;
  providerRequestId: string | null;
  evidenceAvailability: string;
  accessStatus: string;
  sourceType: string;
  finalEvidenceStrength: string;
  evidenceEligibility: string;
  createdAt: Date;
  title: string | null;
  sourceAnomaly: string | null;
  failureReason: string | null;
  judgment: { reportCode: string };
};

type PrismaLike = {
  sourceRecord: {
    findMany(args: {
      where: Prisma.SourceRecordWhereInput;
      include: { judgment: { select: { reportCode: true } } };
      orderBy: { createdAt: "asc" };
    }): Promise<SourceRecordWithReportCode[]>;
    deleteMany(args: { where: Prisma.SourceRecordWhereInput }): Promise<{ count: number }>;
  };
};

const legacyWhere = {
  origin: "UNTRUSTED_LEGACY_SOURCE"
} satisfies Prisma.SourceRecordWhereInput;

export async function cleanupLegacySources(prisma: PrismaLike, options: LegacySourceCleanupOptions): Promise<LegacySourceCleanupResult> {
  const now = options.now ?? new Date();
  const exportPath = options.exportPath ?? defaultExportPath(now);
  const candidates = await prisma.sourceRecord.findMany({
    where: legacyWhere,
    include: { judgment: { select: { reportCode: true } } },
    orderBy: { createdAt: "asc" }
  });

  await writeLegacySourceExport(exportPath, candidates);

  const affectedJudgmentCount = new Set(candidates.map((source) => source.judgmentId)).size;
  const deletedCount = options.execute ? (await prisma.sourceRecord.deleteMany({ where: legacyWhere })).count : 0;

  return {
    execute: options.execute,
    candidateCount: candidates.length,
    deletedCount,
    affectedJudgmentCount,
    exportPath,
    sample: candidates.slice(0, 10).map((source) => ({
      id: source.id,
      reportCode: source.judgment.reportCode,
      origin: source.origin,
      evidenceAvailability: source.evidenceAvailability,
      title: source.title,
      url: source.originalUrl
    }))
  };
}

function defaultExportPath(now: Date) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return join(process.cwd(), "logs", `legacy-sources-${stamp}.csv`);
}

async function writeLegacySourceExport(
  exportPath: string,
  sources: SourceRecordWithReportCode[]
) {
  await mkdir(dirname(exportPath), { recursive: true });
  const rows = [
    [
      "id",
      "judgmentId",
      "reportCode",
      "origin",
      "provider",
      "providerRequestId",
      "evidenceAvailability",
      "accessStatus",
      "sourceType",
      "finalEvidenceStrength",
      "evidenceEligibility",
      "createdAt",
      "title",
      "url",
      "sourceAnomaly",
      "failureReason"
    ],
    ...sources.map((source) => [
      source.id,
      source.judgmentId,
      source.judgment.reportCode,
      source.origin,
      source.provider ?? "",
      source.providerRequestId ?? "",
      source.evidenceAvailability,
      source.accessStatus,
      source.sourceType,
      source.finalEvidenceStrength,
      source.evidenceEligibility,
      source.createdAt.toISOString(),
      source.title ?? "",
      source.originalUrl,
      source.sourceAnomaly ?? "",
      source.failureReason ?? ""
    ])
  ];

  await writeFile(exportPath, rows.map((row) => row.map(csv).join(",")).join("\n"), "utf8");
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
