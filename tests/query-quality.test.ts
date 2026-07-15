import { describe, expect, it } from "vitest";
import { filterEvidenceSeekingQueries, type SearchQueryPlanItem } from "../lib/query-generator";

describe("query quality guardrail", () => {
  it("drops generic startup-advice searches", () => {
    const items: SearchQueryPlanItem[] = [
      { query: "indie hackers build product no one wants reddit", market: "OVERSEAS", intent: "PAIN" },
      { query: "site:reddit.com \"I hate tracking expenses\" freelancer", market: "OVERSEAS", intent: "PAIN" }
    ];

    expect(filterEvidenceSeekingQueries(items).map((item) => item.query)).toEqual([items[1]?.query]);
  });

  it("keeps workaround, payment, and alternative queries", () => {
    const items: SearchQueryPlanItem[] = [
      { query: "how do you handle manual expense tracking spreadsheet", market: "OVERSEAS", intent: "WORKAROUND" },
      { query: "freelancer willing to pay expense tracker pricing", market: "OVERSEAS", intent: "PAYMENT" },
      { query: "any alternative to expense tracker too complicated", market: "OVERSEAS", intent: "COMPETITOR" }
    ];

    expect(filterEvidenceSeekingQueries(items)).toEqual(items);
  });
});
