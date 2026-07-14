import { z } from "zod";

const sessionId = z.string().uuid();
const databaseId = z.string().regex(/^[a-z0-9_-]{10,64}$/i);
const reportCode = z.string().regex(/^RN-[A-Z0-9-]{6,40}$/);
const deepDiveMode = z.enum(["EVIDENCE_EXECUTION", "IDEA_SIGNAL_REPAIR"]);

const baseFields = {
  anonymousSessionId: sessionId,
  judgmentId: databaseId.optional(),
  deepDiveReportId: databaseId.optional()
};

export const PublicAnalyticsEventSchema = z.discriminatedUnion("eventType", [
  z
    .object({
      ...baseFields,
      eventType: z.literal("free_report_offer_viewed"),
      properties: z
        .object({
          reportCode: reportCode.nullable(),
          mode: deepDiveMode.nullable()
        })
        .strict()
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventType: z.literal("byok_connection_requested"),
      properties: z
        .object({
          reportCode: reportCode.nullable(),
          mode: deepDiveMode.nullable()
        })
        .strict()
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventType: z.literal("support_page_viewed"),
      properties: z
        .object({
          reportCode: reportCode.nullable(),
          mode: deepDiveMode.nullable()
        })
        .strict()
    })
    .strict(),
  z
    .object({
      ...baseFields,
      eventType: z.literal("today_action_completed"),
      properties: z
        .object({
          mode: z.enum(["EVIDENCE_BASED", "HYPOTHESIS_VALIDATION"]),
          evidenceSourceCount: z.number().int().min(0).max(40)
        })
        .strict()
    })
    .strict()
]);

export type PublicAnalyticsEvent = z.infer<typeof PublicAnalyticsEventSchema>;
