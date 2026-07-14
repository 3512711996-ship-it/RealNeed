import { z } from "zod";
import { callKimiJson } from "@/lib/kimi";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import type { ApiUsageContext } from "@/lib/usage-tracker";
import type { InterpretedIdea } from "@/lib/types";

const RawQueryPlanSchema = z
  .object({
    queries: z
      .array(
        z
          .object({
            query: z.string().min(3).max(240),
            market: z.string().min(1).max(80),
            intent: z.string().min(1).max(80)
          })
          .strict()
      )
      .min(1)
      .max(10)
  })
  .strict();

export const QueryPlanSchema = RawQueryPlanSchema.transform((plan) => ({
  queries: plan.queries.map((item) => ({
    query: item.query,
    market: normalizeMarket(item.market, item.query),
    intent: normalizeIntent(item.intent, item.query)
  }))
}));

export type SearchQueryPlanItem = z.infer<typeof QueryPlanSchema>["queries"][number];

export function parseSearchQueryPlan(value: unknown) {
  return QueryPlanSchema.parse(value);
}

export class QueryGenerationError extends Error {
  status = 502;

  constructor(message = "Kimi query generation failed. No local fallback was used.") {
    super(message);
    this.name = "QueryGenerationError";
  }
}

export async function generateSearchQueryPlan(
  idea: string,
  interpretedIdea: InterpretedIdea,
  usage?: Omit<ApiUsageContext, "operation">
): Promise<SearchQueryPlanItem[]> {
  try {
    const response = await callKimiJson({
      schema: QueryPlanSchema,
      system: [
        "你是 RealNeed 的搜索词生成器。",
        "你不能生成、猜测、补全或修改任何来源 URL。",
        "所有来源只能来自外部搜索服务或用户提供的数据。",
        "如果没有真实来源，返回搜索 query，不得构造示例来源。",
        "输出 JSON 必须严格符合 schema，不允许包含 url、title、excerpt、source、redditPostId、userQuote。"
      ].join("\n"),
      user: [
        "<UNTRUSTED_USER_IDEA>",
        idea,
        "</UNTRUSTED_USER_IDEA>",
        "",
        "系统理解：",
        JSON.stringify(interpretedIdea, null, 2),
        "",
        "请生成 6-10 条真实搜索查询，覆盖痛点、笨办法、付费/成本、竞品替代。不要输出任何来源信息。",
        "",
        '只返回 JSON。每个 market 必须只写一个值：DOMESTIC 或 OVERSEAS。',
        '每个 intent 必须只写一个值：PAIN、WORKAROUND、PAYMENT 或 COMPETITOR。',
        '格式：{"queries":[{"query":"string","market":"DOMESTIC","intent":"PAIN"}]}'
      ].join("\n"),
      temperature: 0.1,
      usage: usage ? { ...usage, operation: "query_generation" } : undefined
    });

    return uniqueQueries(response.queries);
  } catch (error) {
    if (error instanceof ProviderExecutionError) throw error;
    const message = error instanceof Error ? error.message : "Kimi query generation failed";
    throw new QueryGenerationError(message);
  }
}

export function queriesToStrings(items: SearchQueryPlanItem[]) {
  return items.map((item) => item.query);
}

function uniqueQueries(items: SearchQueryPlanItem[]) {
  const seen = new Set<string>();
  const output: SearchQueryPlanItem[] = [];

  for (const item of items) {
    const key = item.query.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({ ...item, query: item.query.trim() });
  }

  return output.slice(0, 10);
}

function normalizeMarket(value: string, query: string): "DOMESTIC" | "OVERSEAS" {
  const normalized = value.trim().toUpperCase();
  if (normalized === "DOMESTIC") return "DOMESTIC";
  if (normalized === "OVERSEAS") return "OVERSEAS";

  const hasDomestic = /DOMESTIC|CHINA|CHINESE|\bCN\b|中国|国内|大陆|中文/.test(normalized);
  const hasOverseas = /OVERSEAS|GLOBAL|INTERNATIONAL|ENGLISH|国外|海外/.test(normalized);
  if (hasDomestic && !hasOverseas) return "DOMESTIC";
  if (hasOverseas && !hasDomestic) return "OVERSEAS";

  const queryText = query.toLowerCase();
  if (/知乎|小红书|微信|微博|抖音|豆瓣|贴吧|b站|bilibili|国内|中国|大学生|食堂|自由职业|发票|账单/.test(query)) return "DOMESTIC";
  if (/reddit|quora|producthunt|hacker news|stackoverflow|indiehackers|app store|trustpilot|english|overseas|global/.test(queryText)) return "OVERSEAS";

  return /[\u4e00-\u9fff]/.test(query) ? "DOMESTIC" : "OVERSEAS";
}

function normalizeIntent(value: string, query: string): "PAIN" | "WORKAROUND" | "PAYMENT" | "COMPETITOR" {
  const normalized = value.trim().toUpperCase();
  if (normalized === "PAIN" || normalized === "WORKAROUND" || normalized === "PAYMENT" || normalized === "COMPETITOR") return normalized;

  const queryText = query.toLowerCase();
  if (/alternative|competitor|vs|compare|替代|竞品|对比|类似/.test(queryText)) return "COMPETITOR";
  if (/pay|paid|price|pricing|cost|subscription|付费|收费|价格|订阅|成本/.test(queryText)) return "PAYMENT";
  if (/manual|spreadsheet|excel|notion|workflow|workaround|手动|表格|笨办法|流程/.test(queryText)) return "WORKAROUND";
  return "PAIN";
}
