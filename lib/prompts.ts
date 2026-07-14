import type { EvidenceSource, InterpretedIdea, ProductOpportunity, SearchResult } from "@/lib/types";

export const evidenceFirstRules = `
你是 Evidence-first AI Product Builder。所有判断都必须遵守：
1. 没有真实需求证据，不生成产品方向。
2. 不能做成 1-3 天 MVP，不推荐。
3. 不适合刚会 Cursor / Codex / ChatGPT / Vibe Coding 的新手，不推荐。
4. 不能说明第一步验证动作，不推荐。
5. 不能说明中国环境怎么收费，不推荐。
6. 不承诺赚钱，不说蓝海，不输出平台、社区、超级 App。
7. 不编造来源，不编造用户原话，不把新闻、教程、广告当强证据。
8. 你绝对不能编造来源链接。
9. 你绝对不能编造 Reddit 帖子。
10. 你只能引用系统提供的 verified sources。
`.trim();

export const redditDemandRules = `
有效 Reddit 需求证据包括：
1. 用户明确抱怨某个问题。
2. 用户在求推荐工具。
3. 用户说现有工具不好用。
4. 用户描述重复、耗时、麻烦的流程。
5. 用户提到自己现在用表格、手动、Notion、Excel 等笨办法解决。
6. 评论区多人表示有同样问题。

无效 Reddit 证据包括：
1. 纯教程。
2. 纯新闻。
3. 纯推广。
4. 纯观点。
5. 没有具体用户场景的讨论。
6. 只有创业者自嗨，没有用户痛点。
`.trim();

export function interpretIdeaPrompt(idea: string) {
  return `
请把用户的产品想法拆成可搜索、可验证的需求假设。

<UNTRUSTED_USER_IDEA>
${idea}
</UNTRUSTED_USER_IDEA>

只返回 JSON：
{
  "domain": "string",
  "targetUsers": ["string"],
  "possiblePainPoints": ["string"],
  "keywordsZh": ["string"],
  "keywordsEn": ["string"],
  "assumptions": ["string"]
}
`.trim();
}

export function extractEvidencePrompt({
  idea,
  interpretedIdea,
  searchResults
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  searchResults: SearchResult[];
}) {
  return `
${evidenceFirstRules}
${redditDemandRules}

任务：从 verified sources 中提取真实需求证据。

原始想法：
<UNTRUSTED_USER_IDEA>
${idea}
</UNTRUSTED_USER_IDEA>

系统理解：
${JSON.stringify(interpretedIdea, null, 2)}

verified sources：
<UNTRUSTED_SOURCE_CONTENT>
${JSON.stringify(searchResults, null, 2)}
</UNTRUSTED_SOURCE_CONTENT>

硬性规则：
- 如果 verified sources 为空，必须返回 {"evidence": []}。
- 只能引用 verified sources 中已经存在的 title、url、platform、subreddit、rawContent。
- URL 必须完全来自 verified sources.url。如果没有 URL，就写 null 或省略。
- 不能自己创造 URL。
- 不能自己创造 Reddit 帖子。
- sourceText 必须是 rawContent 里出现过的原文片段，不能改写。
- userQuoteOrSummary 必须来自 rawContent，可以短摘要，但不能添加 rawContent 没有的信息。
- 如果只是教程、广告、营销软文、纯观点或新闻，不要当 evidence。
- Reddit evidence 必须输出 subreddit、userQuoteOrSummary、whyThisIsDemand；无法确认 subreddit 就写 "unknown"。
- whyThisIsDemand 必须说明它属于“抱怨 / 求推荐工具 / 现有工具不好用 / 重复耗时流程 / 笨办法替代 / 多人同感”中的哪一种。
- relevanceScore 必须是 0-100 的整数。

只返回 JSON：
{
  "evidence": [
    {
      "id": "e1",
      "title": "string",
      "url": "string optional",
      "platform": "string",
      "subreddit": "string optional",
      "sourceText": "string",
      "painPoint": "string",
      "targetUser": "string",
      "existingAlternative": "string optional",
      "userQuoteOrSummary": "string optional",
      "whyThisIsDemand": "string optional",
      "evidenceStrength": "weak | medium | strong",
      "relevanceScore": 0
    }
  ]
}
`.trim();
}

export function generateOpportunitiesPrompt({
  idea,
  interpretedIdea,
  evidence
}: {
  idea: string;
  interpretedIdea: InterpretedIdea;
  evidence: EvidenceSource[];
}) {
  return `
${evidenceFirstRules}
${redditDemandRules}

任务：只基于 evidence 生成最多 3 个新手可做的小产品机会。

原始想法：
<UNTRUSTED_USER_IDEA>
${idea}
</UNTRUSTED_USER_IDEA>

系统理解：
${JSON.stringify(interpretedIdea, null, 2)}

可用 evidence：
<UNTRUSTED_SOURCE_CONTENT>
${JSON.stringify(evidence, null, 2)}
</UNTRUSTED_SOURCE_CONTENT>

硬性要求：
- 如果 evidence 少于 2 条，必须返回 {"opportunities": []}。
- 不能生成 evidence 之外的需求。
- 每个机会必须先引用 evidence，且必须关联 sourceEvidenceIds。
- 每个机会至少绑定 1 条 valid evidence，否则不要输出。
- MVP 必须能在 1-3 天做出，并且可以先人工交付。
- firstStep 必须是具体到今天能做的验证动作。
- monetization 必须说明中国环境下怎么低成本收费，不能承诺收益。
- 不输出平台、社区、超级 App，不输出泛泛工具。

只返回 JSON：
{
  "opportunities": [
    {
      "id": "op1",
      "productName": "string",
      "oneSentence": "string",
      "targetUser": "string",
      "painPoint": "string",
      "sourceEvidenceIds": ["e1"],
      "mvp": "string",
      "firstStep": "string",
      "monetization": "string",
      "chinaFit": "string",
      "difficulty": "easy | medium | hard",
      "evidenceScore": 0,
      "risks": ["string"],
      "whyNotGeneric": "string"
    }
  ]
}
`.trim();
}

export function skepticReviewPrompt({
  opportunities,
  evidence
}: {
  opportunities: ProductOpportunity[];
  evidence: EvidenceSource[];
}) {
  return `
${evidenceFirstRules}

请冷静审查这些产品机会，只保留通过审查的机会。

审查问题：
- 是否太大？
- 是否普通 ChatGPT 也能随便说出来？
- 是否有真实证据支撑？
- sourceEvidenceIds 是否都来自给定 evidence？
- 新手能不能做？
- 第一验证动作是否具体？
- 国内收费是否现实？
- 是否夸大收益？

机会：
${JSON.stringify(opportunities, null, 2)}

证据：
${JSON.stringify(evidence, null, 2)}

只返回 JSON：
{
  "opportunities": [],
  "warnings": ["string"]
}
`.trim();
}
