import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupLegacySources } from "../lib/legacy-source-cleanup";

const tmpDir = join(process.cwd(), "test-results", "legacy-source-cleanup");

describe("legacy source cleanup", () => {
  beforeEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("exports legacy sources without deleting them during dry-run", async () => {
    const db = fakePrisma([legacySource("legacy-1"), searchSource("search-1")]);
    const exportPath = join(tmpDir, "legacy.csv");

    const result = await cleanupLegacySources(db, { execute: false, exportPath });

    expect(result.candidateCount).toBe(1);
    expect(result.deletedCount).toBe(0);
    expect(result.affectedJudgmentCount).toBe(1);
    expect(db.rows).toHaveLength(2);
    expect(await readFile(exportPath, "utf8")).toContain("legacy-1");
    expect(await readFile(exportPath, "utf8")).not.toContain("search-1");
  });

  it("deletes only quarantined legacy sources when execute is explicit", async () => {
    const db = fakePrisma([legacySource("legacy-1"), legacySource("legacy-2", "judgment-2"), searchSource("search-1"), pastedSource("pasted-1")]);
    const exportPath = join(tmpDir, "purge.csv");

    const result = await cleanupLegacySources(db, { execute: true, exportPath });

    expect(result.candidateCount).toBe(2);
    expect(result.deletedCount).toBe(2);
    expect(result.affectedJudgmentCount).toBe(2);
    expect(db.rows.map((row) => row.id)).toEqual(["search-1", "pasted-1"]);
  });
});

function fakePrisma(initialRows: SourceRow[]) {
  const db = {
    rows: [...initialRows],
    sourceRecord: {
      findMany: async ({ where, include, orderBy }: FindManyArgs) => {
        expect(where).toEqual({ origin: "UNTRUSTED_LEGACY_SOURCE" });
        expect(include).toEqual({ judgment: { select: { reportCode: true } } });
        expect(orderBy).toEqual({ createdAt: "asc" });
        return db.rows.filter((row) => row.origin === "UNTRUSTED_LEGACY_SOURCE");
      },
      deleteMany: async ({ where }: DeleteManyArgs) => {
        expect(where).toEqual({ origin: "UNTRUSTED_LEGACY_SOURCE" });
        const before = db.rows.length;
        db.rows = db.rows.filter((row) => row.origin !== "UNTRUSTED_LEGACY_SOURCE");
        return { count: before - db.rows.length };
      }
    }
  };
  return db;
}

function legacySource(id: string, judgmentId = "judgment-1"): SourceRow {
  return source(id, judgmentId, "UNTRUSTED_LEGACY_SOURCE", "NO_EVIDENCE");
}

function searchSource(id: string): SourceRow {
  return source(id, "judgment-search", "SEARCH_PROVIDER", "CONFIRMED_CONTENT");
}

function pastedSource(id: string): SourceRow {
  return source(id, "judgment-pasted", "USER_PASTED", "CONFIRMED_CONTENT");
}

function source(id: string, judgmentId: string, origin: SourceRow["origin"], evidenceAvailability: SourceRow["evidenceAvailability"]): SourceRow {
  return {
    id,
    judgmentId,
    searchRequestId: null,
    originalUrl: `https://example.com/${id}`,
    normalizedUrl: null,
    canonicalUrl: null,
    host: "example.com",
    origin,
    provider: origin === "SEARCH_PROVIDER" ? "TAVILY" : null,
    providerRequestId: origin === "SEARCH_PROVIDER" ? "req-1" : null,
    evidenceAvailability,
    sourceType: "USER_DISCUSSION",
    accessStatus: "UNVERIFIED",
    evidenceStrength: "NOT_CLASSIFIED",
    modelSuggestedStrength: "NOT_CLASSIFIED",
    finalEvidenceStrength: "NOT_CLASSIFIED",
    evidenceEligibility: origin === "UNTRUSTED_LEGACY_SOURCE" ? "UNVERIFIED" : "ELIGIBLE_USER_EVIDENCE",
    hardRuleReasonCodes: [],
    qualifyingExcerpt: null,
    qualifyingSignals: [],
    paymentSignalLevel: "NONE",
    marketScope: "UNKNOWN",
    verificationOrigin: null,
    httpStatus: null,
    contentType: null,
    redirectCount: 0,
    verificationErrorCode: null,
    searchDiscoveredAt: null,
    contentExtractedAt: null,
    contentExtractionStatus: null,
    extractionFailureReason: null,
    title: `Source ${id}`,
    rawContent: null,
    excerpt: null,
    failureReason: null,
    sourceAnomaly: origin === "UNTRUSTED_LEGACY_SOURCE" ? "UNTRUSTED_LEGACY_SOURCE" : null,
    sourceDisplayId: null,
    contentHash: null,
    discussionClusterId: null,
    promptInjectionDetected: false,
    durationMs: null,
    checkedAt: null,
    classifiedAt: null,
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    judgment: { reportCode: `RN-${judgmentId}` }
  };
}

type FindManyArgs = {
  where: Prisma.SourceRecordWhereInput;
  include: { judgment: { select: { reportCode: boolean } } };
  orderBy: { createdAt: string };
};

type DeleteManyArgs = {
  where: Prisma.SourceRecordWhereInput;
};

type SourceRow = {
  id: string;
  judgmentId: string;
  searchRequestId: string | null;
  originalUrl: string;
  normalizedUrl: string | null;
  canonicalUrl: string | null;
  host: string | null;
  origin: "SEARCH_PROVIDER" | "USER_PASTED" | "USER_URL" | "MANUAL_IMPORT" | "UNTRUSTED_LEGACY_SOURCE";
  provider: string | null;
  providerRequestId: string | null;
  evidenceAvailability: "CONFIRMED_CONTENT" | "SEARCH_LEAD" | "NO_EVIDENCE";
  sourceType: string;
  accessStatus: string;
  evidenceStrength: string;
  modelSuggestedStrength: string;
  finalEvidenceStrength: string;
  evidenceEligibility: string;
  hardRuleReasonCodes: unknown;
  qualifyingExcerpt: string | null;
  qualifyingSignals: unknown;
  paymentSignalLevel: string;
  marketScope: string;
  verificationOrigin: string | null;
  httpStatus: number | null;
  contentType: string | null;
  redirectCount: number;
  verificationErrorCode: string | null;
  searchDiscoveredAt: Date | null;
  contentExtractedAt: Date | null;
  contentExtractionStatus: string | null;
  extractionFailureReason: string | null;
  title: string | null;
  rawContent: string | null;
  excerpt: string | null;
  failureReason: string | null;
  sourceAnomaly: string | null;
  sourceDisplayId: string | null;
  contentHash: string | null;
  discussionClusterId: string | null;
  promptInjectionDetected: boolean;
  durationMs: number | null;
  checkedAt: Date | null;
  classifiedAt: Date | null;
  createdAt: Date;
  judgment: { reportCode: string };
};
