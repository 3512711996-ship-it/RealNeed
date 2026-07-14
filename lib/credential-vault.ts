import type { ApiCredentialKind, ApiCredentialStatus, Prisma } from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getCredentialEncryptionProvider } from "@/lib/credential-encryption";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";

export type SafeCredential = {
  id: string;
  kind: ApiCredentialKind;
  provider: string;
  status: ApiCredentialStatus;
  keyLastFour: string;
  selectedModel: string | null;
  lastVerifiedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
};

export async function listCredentials(ownerSessionHash: string): Promise<SafeCredential[]> {
  return prisma.apiCredential.findMany({
    where: { ownerSessionHash, status: { not: "REVOKED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, provider: true, status: true, keyLastFour: true, selectedModel: true, lastVerifiedAt: true, lastUsedAt: true, expiresAt: true }
  });
}

export async function saveVerifiedCredential(input: {
  ownerSessionHash: string;
  kind: ApiCredentialKind;
  provider: string;
  apiKey: string;
  selectedModel?: string | null;
}) {
  const encryption = getCredentialEncryptionProvider();
  const encrypted = encryption.encrypt(input.apiKey);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getServerEnv().apiCredentialRetentionHours * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const old = await tx.apiCredential.findMany({
      where: { ownerSessionHash: input.ownerSessionHash, kind: input.kind, provider: input.provider, status: { in: ["ACTIVE", "INVALID", "PENDING_VERIFICATION"] } },
      select: { id: true }
    });
    if (old.length) {
      await tx.apiCredential.updateMany({
        where: { id: { in: old.map((item) => item.id) } },
        data: { status: "REVOKED", revokedAt: now, encryptedSecret: null, encryptionIv: null, encryptionAuthTag: null }
      });
      await tx.job.updateMany({
        where: { credentialBindings: { some: { credentialId: { in: old.map((item) => item.id) } } }, status: { in: ["QUEUED", "RUNNING"] } },
        data: { status: "WAITING_FOR_CREDENTIAL", stage: "waiting_for_credential", lastErrorCode: "USER_CREDENTIAL_REVOKED", lastErrorMessage: "API 连接已被替换，请明确选择新连接后继续任务。" }
      });
    }
    return tx.apiCredential.create({
      data: {
        ownerSessionHash: input.ownerSessionHash,
        kind: input.kind,
        provider: input.provider,
        ...encrypted,
        keyLastFour: input.apiKey.slice(-4),
        selectedModel: input.selectedModel ?? null,
        status: "ACTIVE",
        lastVerifiedAt: now,
        expiresAt
      },
      select: { id: true, kind: true, provider: true, status: true, keyLastFour: true, selectedModel: true, lastVerifiedAt: true, lastUsedAt: true, expiresAt: true }
    });
  });
}

export async function revokeCredential(ownerSessionHash: string, credentialId: string) {
  const credential = await prisma.apiCredential.findFirst({ where: { id: credentialId, ownerSessionHash }, select: { id: true } });
  if (!credential) throw Object.assign(new Error("没有找到这个 API 连接。"), { status: 404 });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.apiCredential.update({ where: { id: credentialId }, data: { status: "REVOKED", revokedAt: now, encryptedSecret: null, encryptionIv: null, encryptionAuthTag: null } });
    await tx.job.updateMany({
      where: { credentialBindings: { some: { credentialId } }, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "WAITING_FOR_CREDENTIAL", stage: "waiting_for_credential", lastErrorCode: "USER_CREDENTIAL_REVOKED", lastErrorMessage: "你的 API 连接已断开，请更新连接后继续任务。", lockedAt: null, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null }
    });
  });
}

export async function decryptCredentialForCall(input: { credentialId: string; ownerSessionHash: string; kind: ApiCredentialKind; provider: string }) {
  const credential = await prisma.apiCredential.findFirst({ where: { id: input.credentialId, ownerSessionHash: input.ownerSessionHash, kind: input.kind, provider: input.provider } });
  if (!credential) throw credentialError("USER_CREDENTIAL_REVOKED", input.provider, input.kind, "找不到属于当前会话的 API 连接，请重新连接。", 404);
  if (credential.status === "REVOKED") throw credentialError("USER_CREDENTIAL_REVOKED", input.provider, input.kind, "API 连接已撤销，请重新连接。", 409);
  if (credential.status === "INVALID") throw credentialError("USER_API_KEY_INVALID", input.provider, input.kind, "API 连接已失效，请更新 Key。", 409);
  if (credential.status === "EXPIRED" || credential.expiresAt <= new Date()) {
    await prisma.apiCredential.updateMany({ where: { id: credential.id, status: { not: "REVOKED" } }, data: { status: "EXPIRED", encryptedSecret: null, encryptionIv: null, encryptionAuthTag: null } });
    throw credentialError("USER_CREDENTIAL_EXPIRED", input.provider, input.kind, "API 连接已到期，请重新连接。", 409);
  }
  if (!credential.encryptedSecret || !credential.encryptionIv || !credential.encryptionAuthTag) throw credentialError("USER_CREDENTIAL_REVOKED", input.provider, input.kind, "API 连接的密文已清除，请重新连接。", 409);
  const apiKey = getCredentialEncryptionProvider().decrypt({ encryptedSecret: credential.encryptedSecret, encryptionIv: credential.encryptionIv, encryptionAuthTag: credential.encryptionAuthTag, encryptionKeyVersion: credential.encryptionKeyVersion });
  return { apiKey, credentialId: credential.id, selectedModel: credential.selectedModel };
}

export async function markCredentialUsed(credentialId: string) {
  await prisma.apiCredential.updateMany({ where: { id: credentialId, status: "ACTIVE" }, data: { lastUsedAt: new Date() } });
}

export async function markCredentialInvalid(credentialId: string) {
  await prisma.apiCredential.updateMany({ where: { id: credentialId, status: "ACTIVE" }, data: { status: "INVALID" } });
}

export function createConnectionTestProof(input: { ownerSessionHash: string; kind: string; provider: string; model?: string | null; apiKey: string }) {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const payload = [input.ownerSessionHash, input.kind, input.provider, input.model ?? "", hashSecret(input.apiKey), String(expiresAt)].join("|");
  return `${expiresAt}.${createHmac("sha256", proofKey()).update(payload).digest("base64url")}`;
}

export function verifyConnectionTestProof(input: { proof: string; ownerSessionHash: string; kind: string; provider: string; model?: string | null; apiKey: string }) {
  const [expiresRaw, signature] = input.proof.split(".");
  const expiresAt = Number(expiresRaw);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const payload = [input.ownerSessionHash, input.kind, input.provider, input.model ?? "", hashSecret(input.apiKey), String(expiresAt)].join("|");
  const expected = createHmac("sha256", proofKey()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function proofKey() {
  const key = getServerEnv().apiCredentialEncryptionKey;
  if (!key) throw Object.assign(new Error("BYOK 加密主密钥未配置，无法签发连接测试证明。"), { status: 503, code: "BYOK_ENCRYPTION_NOT_CONFIGURED" });
  return createHash("sha256").update(key).digest();
}
function hashSecret(value: string) { return createHash("sha256").update(value).digest("hex"); }
function credentialError(code: "USER_CREDENTIAL_REVOKED" | "USER_CREDENTIAL_EXPIRED" | "USER_API_KEY_INVALID", provider: string, kind: ApiCredentialKind, message: string, status: number) {
  return new ProviderExecutionError(code, provider, kind, message, false, true, status);
}

export function safeCredentialSelect() {
  return { id: true, kind: true, provider: true, status: true, keyLastFour: true, selectedModel: true, lastVerifiedAt: true, lastUsedAt: true, expiresAt: true } satisfies Prisma.ApiCredentialSelect;
}
