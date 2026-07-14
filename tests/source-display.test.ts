import { describe, expect, it } from "vitest";
import {
  formatDirectVerificationReason,
  formatEvidenceReasonCodes,
  formatExtractionFailureReason,
  formatSignalExplanation
} from "@/lib/source-display";
import type { ScannedSource } from "@/lib/types";

describe("source display localization", () => {
  it("turns evidence reason codes into user-facing Chinese", () => {
    expect(formatEvidenceReasonCodes(["DIRECT_VERIFICATION_REQUIRED", "NON_USER_SOURCE", "BACKGROUND_INFORMATION_ONLY"])).toBe(
      "原网页没有通过 RealNeed 的直接访问验证；不是用户真实讨论；只能作为背景信息，不能作为用户需求证据"
    );
  });

  it("does not expose Tavily extraction errors directly", () => {
    expect(formatExtractionFailureReason("Failed to fetch url")).toBe(
      "正文提取服务未能读取该页面。搜索线索会保留，但不会被当作已提取的需求证据。"
    );
  });

  it("explains a blocked direct verification without claiming the link is missing", () => {
    expect(formatDirectVerificationReason("HTTP 403", "BLOCKED", 403)).toBe(
      "网站拒绝 RealNeed 服务器访问。这不代表链接不存在，但本次不能把它计入正式证据。"
    );
  });

  it("derives weak-signal copy from hard rules instead of raw model text", () => {
    const source = {
      id: "s1",
      title: "Example",
      url: "https://example.com",
      platform: "web",
      query: "example",
      isAccessible: false,
      signalStrength: "weak",
      finalEvidenceStrength: "weak",
      evidenceEligibility: "UNVERIFIED",
      hardRuleReasonCodes: ["DIRECT_VERIFICATION_REQUIRED", "NO_CONCRETE_USER"],
      whyThisSignal: "Weak because DIRECT_VERIFICATION_REQUIRED"
    } satisfies ScannedSource;

    expect(formatSignalExplanation(source)).toBe(
      "未计入正式证据：原网页没有通过 RealNeed 的直接访问验证；没有说明具体是哪类用户遇到问题。"
    );
  });
});
