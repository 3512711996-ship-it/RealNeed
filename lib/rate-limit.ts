import { createClient } from "redis";
import { getServerEnv } from "@/lib/env";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

export interface RateLimitProvider {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  ping?(): Promise<void>;
}

type RedisClientLike = {
  isReady: boolean;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<unknown>;
  connect(): Promise<unknown>;
  disconnect(): Promise<void>;
  ping(): Promise<unknown>;
  on(event: "error", listener: (error: unknown) => void): unknown;
};

export class RateLimitError extends Error {
  status = 429;
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class RateLimitUnavailableError extends Error {
  status = 503;

  constructor() {
    super("请求保护服务暂时不可用，请稍后再试。");
    this.name = "RateLimitUnavailableError";
  }
}

export class MemoryRateLimitProvider implements RateLimitProvider {
  private readonly buckets = new Map<string, Bucket>();

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0, resetAt };
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        resetAt: bucket.resetAt
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: 0,
      resetAt: bucket.resetAt
    };
  }
}

const redisConsumeScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

export class RedisRateLimitProvider implements RateLimitProvider {
  constructor(
    private readonly client: RedisClientLike,
    private readonly prefix = "realneed:rate-limit:"
  ) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const result = await this.client.eval(redisConsumeScript, {
      keys: [`${this.prefix}${normalizeKey(key)}`],
      arguments: [String(windowMs)]
    });
    const [count, ttl] = parseRedisResult(result, windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: count <= limit ? 0 : retryAfterSeconds,
      resetAt: Date.now() + ttl
    };
  }

  async ping() {
    await this.client.ping();
  }
}

const memoryProvider = new MemoryRateLimitProvider();
let redisClient: RedisClientLike | null = null;
let redisProvider: RedisRateLimitProvider | null = null;
let redisConnecting: Promise<RedisClientLike> | null = null;

export async function assertRateLimit({
  key,
  limit,
  windowMs,
  message = "请求过于频繁，请稍后再试。",
  provider
}: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
  provider?: RateLimitProvider;
}) {
  let result: RateLimitResult;
  try {
    result = await (provider ?? (await getRateLimitProvider())).consume(key, limit, windowMs);
  } catch (error) {
    console.error("[RealNeed security] rate_limit_provider_unavailable", {
      provider: getServerEnv().rateLimitProvider,
      errorCode: safeProviderErrorCode(error)
    });
    throw new RateLimitUnavailableError();
  }

  if (!result.allowed) {
    throw new RateLimitError(message, result.retryAfterSeconds);
  }

  return result;
}

export async function getRateLimitProvider(): Promise<RateLimitProvider> {
  const env = getServerEnv();
  if (process.env.NODE_ENV === "production" && env.rateLimitProvider !== "redis") {
    throw new RateLimitUnavailableError();
  }
  if (env.rateLimitProvider === "memory") return memoryProvider;
  if (!env.redisUrl) throw new RateLimitUnavailableError();
  if (redisProvider) return redisProvider;
  const client = await getConnectedRedisClient(env.redisUrl);
  redisProvider = new RedisRateLimitProvider(client);
  return redisProvider;
}

export async function checkRateLimitHealth() {
  const provider = await getRateLimitProvider();
  await provider.ping?.();
}

export function getClientIp(request: Request) {
  return getClientIpFromHeaders(request.headers);
}

export function getClientIpFromHeaders(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "local";
}

export function isRateLimitError(error: unknown): error is RateLimitError | RateLimitUnavailableError {
  return error instanceof RateLimitError || error instanceof RateLimitUnavailableError;
}

async function getConnectedRedisClient(redisUrl: string) {
  if (redisClient?.isReady) return redisClient;
  if (redisConnecting) return redisConnecting;

  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: false
    }
  }) as unknown as RedisClientLike;
  client.on("error", () => undefined);
  redisConnecting = client
    .connect()
    .then(() => {
      redisClient = client;
      return client;
    })
    .catch(async (error) => {
      redisConnecting = null;
      await client.disconnect().catch(() => undefined);
      throw error;
    });
  return redisConnecting;
}

function parseRedisResult(result: unknown, fallbackTtl: number): [number, number] {
  if (!Array.isArray(result) || result.length < 2) throw new Error("INVALID_REDIS_RATE_LIMIT_RESULT");
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttl)) throw new Error("INVALID_REDIS_RATE_LIMIT_RESULT");
  return [count, ttl > 0 ? ttl : fallbackTtl];
}

function normalizeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 240);
}

function safeProviderErrorCode(error: unknown) {
  if (error instanceof RateLimitUnavailableError) return "RATE_LIMIT_UNAVAILABLE";
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "UNKNOWN_RATE_LIMIT_ERROR";
}
