import { z } from "zod";
import type { SearchProvider } from "@/lib/types";

const EnvSchema = z.object({
  MOONSHOT_API_KEY: z.string().optional(),
  MOONSHOT_BASE_URL: z.string().url().optional(),
  MOONSHOT_MODEL: z.string().optional(),
  KIMI_BASE_URL: z.string().url().optional(),
  KIMI_MODEL: z.string().optional(),
  KIMI_SEARCH_MODEL: z.string().optional(),
  AI_MODEL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  OWNER_WECHAT_ID: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  REPORT_GENERATION_API_MODE: z.enum(["USER_PROVIDED_REQUIRED", "INSTANCE_ALLOWED"]).optional(),
  ALLOW_INSTANCE_API_FOR_REPORTS: z.string().optional(),
  INSTANCE_DEVELOPER_NAME: z.string().optional(),
  INSTANCE_CONTACT_WECHAT: z.string().optional(),
  INSTANCE_CONTACT_QR_URL: z.string().optional(),
  INSTANCE_DONATION_QR_URL: z.string().optional(),
  INSTANCE_GITHUB_URL: z.string().url().optional(),
  INSTANCE_ISSUES_URL: z.string().url().optional(),
  INSTANCE_SUPPORT_MESSAGE: z.string().optional(),
  SEARCH_PROVIDER: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  TAVILY_PROJECT_ID: z.string().optional(),
  SEARCH_MAX_RESULTS: z.string().optional(),
  SOURCE_VERIFY_CONCURRENCY: z.string().optional(),
  SOURCE_VERIFY_PER_HOST_CONCURRENCY: z.string().optional(),
  SOURCE_VERIFY_TIMEOUT_MS: z.string().optional(),
  SOURCE_VERIFY_TOTAL_BUDGET_MS: z.string().optional(),
  SIGNAL_CLASSIFICATION_CONCURRENCY: z.string().optional(),
  JOB_EXECUTION_MODE: z.string().optional(),
  WORKER_ID: z.string().optional(),
  JOB_LOCK_TIMEOUT_SECONDS: z.string().optional(),
  JOB_POLL_INTERVAL_MS: z.string().optional(),
  JOB_MAX_RUNTIME_SECONDS: z.string().optional(),
  JUDGMENT_JOB_TIMEOUT_SECONDS: z.string().optional(),
  DEEP_DIVE_JOB_TIMEOUT_SECONDS: z.string().optional(),
  DATA_CLEANUP_JOB_TIMEOUT_SECONDS: z.string().optional(),
  REPORT_RETENTION_DAYS: z.string().optional(),
  REPORT_LINK_RETENTION_DAYS: z.string().optional(),
  SOURCE_CONTENT_RETENTION_DAYS: z.string().optional(),
  ANALYTICS_RETENTION_DAYS: z.string().optional(),
  API_USAGE_RETENTION_DAYS: z.string().optional(),
  JOB_EVENT_RETENTION_DAYS: z.string().optional(),
  FREE_REPORT_MAX_COST_CNY: z.string().optional(),
  DEEP_DIVE_MAX_COST_CNY: z.string().optional(),
  KIMI_INPUT_PRICE_PER_MILLION: z.string().optional(),
  KIMI_OUTPUT_PRICE_PER_MILLION: z.string().optional(),
  RATE_LIMIT_PROVIDER: z.string().optional(),
  REDIS_URL: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  BACKUP_DIR: z.string().optional(),
  CLEANUP_INTERVAL_HOURS: z.string().optional()
  ,API_CREDENTIAL_ENCRYPTION_KEY: z.string().optional()
  ,API_CREDENTIAL_ENCRYPTION_KEY_VERSION: z.string().optional()
  ,API_CREDENTIAL_RETENTION_HOURS: z.string().optional()
  ,BYOK_LIVE_TEST_MAX_COST_CNY: z.string().optional()
});

export type ServerEnv = {
  moonshotApiKey?: string;
  moonshotBaseUrl: string;
  moonshotModel: string;
  kimiSearchModel: string;
  databaseUrl?: string;
  ownerWechatId: string;
  adminPassword?: string;
  searchProvider: "tavily" | "auto";
  tavilyApiKey?: string;
  tavilyProjectId?: string;
  searchMaxResults: number;
  sourceVerifyConcurrency: number;
  sourceVerifyPerHostConcurrency: number;
  sourceVerifyTimeoutMs: number;
  sourceVerifyTotalBudgetMs: number;
  signalClassificationConcurrency: number;
  jobExecutionMode: "inline" | "worker";
  workerId: string;
  jobLockTimeoutSeconds: number;
  jobPollIntervalMs: number;
  jobMaxRuntimeSeconds: number;
  judgmentJobTimeoutSeconds: number;
  deepDiveJobTimeoutSeconds: number;
  dataCleanupJobTimeoutSeconds: number;
  reportRetentionDays: number;
  reportLinkRetentionDays: number;
  sourceContentRetentionDays: number;
  analyticsRetentionDays: number;
  apiUsageRetentionDays: number;
  jobEventRetentionDays: number;
  freeReportMaxCostCny: number;
  deepDiveMaxCostCny: number;
  kimiInputPricePerMillion: number;
  kimiOutputPricePerMillion: number;
  rateLimitProvider: "memory" | "redis";
  redisUrl?: string;
  publicAppUrl?: string;
  alertWebhookUrl?: string;
  backupDir?: string;
  cleanupIntervalHours: number;
  apiCredentialEncryptionKey?: string;
  apiCredentialEncryptionKeyVersion: number;
  apiCredentialRetentionHours: number;
  byokLiveTestMaxCostCny: number;
  reportGenerationApiMode: "USER_PROVIDED_REQUIRED" | "INSTANCE_ALLOWED";
  allowInstanceApiForReports: boolean;
  instanceDeveloperName?: string;
  instanceContactWechat?: string;
  instanceContactQrUrl?: string;
  instanceDonationQrUrl?: string;
  instanceGithubUrl?: string;
  instanceIssuesUrl?: string;
  instanceSupportMessage?: string;
};

export type CapabilityStatus = {
  databaseConfigured: boolean;
  searchConfigured: boolean;
  analysisConfigured: boolean;
  paymentConfigured: boolean;
};

export class MissingKimiKeyError extends Error {
  status = 424;

  constructor() {
    super("服务端未配置 Kimi API Key，无法进行 AI 分析。");
    this.name = "MissingKimiKeyError";
  }
}

export class MissingDatabaseUrlError extends Error {
  status = 503;

  constructor() {
    super("服务端未配置 DATABASE_URL，无法保存报告。");
    this.name = "MissingDatabaseUrlError";
  }
}

export class MissingTavilyKeyError extends Error {
  status = 424;

  constructor() {
    super("自动搜索尚未配置 Tavily API Key。");
    this.name = "MissingTavilyKeyError";
  }
}

export function getServerEnv(): ServerEnv {
  const env = parseEnv();
  const moonshotBaseUrl = env.KIMI_BASE_URL ?? env.MOONSHOT_BASE_URL ?? "https://api.moonshot.cn/v1";
  const moonshotModel = env.KIMI_MODEL ?? env.MOONSHOT_MODEL ?? env.AI_MODEL ?? "kimi-k2.5";

  return {
    moonshotApiKey: nonEmpty(env.MOONSHOT_API_KEY),
    moonshotBaseUrl,
    moonshotModel,
    kimiSearchModel: env.KIMI_SEARCH_MODEL ?? moonshotModel,
    databaseUrl: nonEmpty(env.DATABASE_URL),
    ownerWechatId: nonEmpty(env.OWNER_WECHAT_ID) ?? "未配置",
    adminPassword: nonEmpty(env.ADMIN_PASSWORD),
    searchProvider: env.SEARCH_PROVIDER === "tavily" ? "tavily" : "auto",
    tavilyApiKey: nonEmpty(env.TAVILY_API_KEY),
    tavilyProjectId: nonEmpty(env.TAVILY_PROJECT_ID),
    searchMaxResults: parseInteger(env.SEARCH_MAX_RESULTS, 5, 1, 10),
    sourceVerifyConcurrency: parseInteger(env.SOURCE_VERIFY_CONCURRENCY, 6, 1, 12),
    sourceVerifyPerHostConcurrency: parseInteger(env.SOURCE_VERIFY_PER_HOST_CONCURRENCY, 2, 1, 6),
    sourceVerifyTimeoutMs: parseInteger(env.SOURCE_VERIFY_TIMEOUT_MS, 3500, 1000, 15000),
    sourceVerifyTotalBudgetMs: parseInteger(env.SOURCE_VERIFY_TOTAL_BUDGET_MS, 15000, 3000, 60000),
    signalClassificationConcurrency: parseInteger(env.SIGNAL_CLASSIFICATION_CONCURRENCY, 3, 1, 6),
    jobExecutionMode: env.JOB_EXECUTION_MODE === "worker" ? "worker" : "inline",
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    jobLockTimeoutSeconds: parseInteger(env.JOB_LOCK_TIMEOUT_SECONDS, 120, 30, 1800),
    jobPollIntervalMs: parseInteger(env.JOB_POLL_INTERVAL_MS, 1500, 250, 10000),
    jobMaxRuntimeSeconds: parseInteger(env.JOB_MAX_RUNTIME_SECONDS, 180, 30, 1800),
    judgmentJobTimeoutSeconds: parseInteger(env.JUDGMENT_JOB_TIMEOUT_SECONDS, 480, 30, 1800),
    deepDiveJobTimeoutSeconds: parseInteger(env.DEEP_DIVE_JOB_TIMEOUT_SECONDS, 300, 30, 1800),
    dataCleanupJobTimeoutSeconds: parseInteger(env.DATA_CLEANUP_JOB_TIMEOUT_SECONDS, 300, 30, 3600),
    reportRetentionDays: parseInteger(env.REPORT_RETENTION_DAYS, 30, 1, 365),
    reportLinkRetentionDays: parseInteger(env.REPORT_LINK_RETENTION_DAYS, 30, 1, 365),
    sourceContentRetentionDays: parseInteger(env.SOURCE_CONTENT_RETENTION_DAYS, 7, 0, 365),
    analyticsRetentionDays: parseInteger(env.ANALYTICS_RETENTION_DAYS, 180, 1, 730),
    apiUsageRetentionDays: parseInteger(env.API_USAGE_RETENTION_DAYS, 365, 30, 3650),
    jobEventRetentionDays: parseInteger(env.JOB_EVENT_RETENTION_DAYS, 30, 1, 365),
    freeReportMaxCostCny: parseDecimal(env.FREE_REPORT_MAX_COST_CNY, 1.2, 0.1, 50),
    deepDiveMaxCostCny: parseDecimal(env.DEEP_DIVE_MAX_COST_CNY, 3.5, 0.1, 100),
    kimiInputPricePerMillion: parseDecimal(env.KIMI_INPUT_PRICE_PER_MILLION, 12, 0, 1000),
    kimiOutputPricePerMillion: parseDecimal(env.KIMI_OUTPUT_PRICE_PER_MILLION, 12, 0, 1000),
    rateLimitProvider: env.RATE_LIMIT_PROVIDER === "redis" ? "redis" : "memory",
    redisUrl: nonEmpty(env.REDIS_URL),
    publicAppUrl: nonEmpty(env.PUBLIC_APP_URL),
    alertWebhookUrl: nonEmpty(env.ALERT_WEBHOOK_URL),
    backupDir: nonEmpty(env.BACKUP_DIR),
    cleanupIntervalHours: parseInteger(env.CLEANUP_INTERVAL_HOURS, 24, 1, 168)
    ,apiCredentialEncryptionKey: nonEmpty(env.API_CREDENTIAL_ENCRYPTION_KEY)
    ,apiCredentialEncryptionKeyVersion: parseInteger(env.API_CREDENTIAL_ENCRYPTION_KEY_VERSION, 1, 1, 100000)
    ,apiCredentialRetentionHours: parseInteger(env.API_CREDENTIAL_RETENTION_HOURS, 24, 1, 24)
    ,byokLiveTestMaxCostCny: parseDecimal(env.BYOK_LIVE_TEST_MAX_COST_CNY, 0, 0, 1000)
    ,reportGenerationApiMode: env.REPORT_GENERATION_API_MODE ?? "USER_PROVIDED_REQUIRED"
    ,allowInstanceApiForReports: env.ALLOW_INSTANCE_API_FOR_REPORTS === "true" && env.REPORT_GENERATION_API_MODE === "INSTANCE_ALLOWED"
    ,instanceDeveloperName: nonEmpty(env.INSTANCE_DEVELOPER_NAME)
    ,instanceContactWechat: nonEmpty(env.INSTANCE_CONTACT_WECHAT)
    ,instanceContactQrUrl: nonEmpty(env.INSTANCE_CONTACT_QR_URL)
    ,instanceDonationQrUrl: nonEmpty(env.INSTANCE_DONATION_QR_URL)
    ,instanceGithubUrl: nonEmpty(env.INSTANCE_GITHUB_URL)
    ,instanceIssuesUrl: nonEmpty(env.INSTANCE_ISSUES_URL)
    ,instanceSupportMessage: nonEmpty(env.INSTANCE_SUPPORT_MESSAGE)
  };
}

export function getCapabilities(): CapabilityStatus {
  const env = getServerEnv();
  return {
    databaseConfigured: Boolean(env.databaseUrl),
    searchConfigured: Boolean(env.tavilyApiKey),
    analysisConfigured: Boolean(env.moonshotApiKey && env.moonshotBaseUrl && env.moonshotModel),
    // Legacy-only signal. New reports never depend on payment configuration.
    paymentConfigured: false
  };
}

export function requireDatabaseConfigured() {
  if (!getServerEnv().databaseUrl) throw new MissingDatabaseUrlError();
}

export function requireAnalysisConfigured() {
  if (!getServerEnv().moonshotApiKey) throw new MissingKimiKeyError();
}

export function requireSearchConfigured() {
  if (!getServerEnv().tavilyApiKey) throw new MissingTavilyKeyError();
}

function parseEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("服务端环境变量格式不正确。");
  }
  return parsed.data;
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseDecimal(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(value ?? "");
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parseSearchProvider(value: string | undefined): ServerEnv["searchProvider"] {
  if (value === "tavily") return "tavily";
  return "auto";
}

export function assertNoPublicApiKeys() {
  const forbidden = ["NEXT_PUBLIC_TAVILY_API_KEY", "NEXT_PUBLIC_MOONSHOT_API_KEY", "NEXT_PUBLIC_KIMI_API_KEY"];
  const found = forbidden.filter((key) => Boolean(process.env[key]));
  if (found.length) {
    throw new Error(`检测到前端公开 API Key 环境变量：${found.join(", ")}`);
  }
}

export type RuntimeSearchProvider = Exclude<SearchProvider, "manual_paste" | "placeholder_search" | "kimi" | "bocha" | "brave">;
