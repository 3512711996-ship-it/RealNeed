import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";

export type EncryptedCredential = {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  encryptionKeyVersion: number;
};

export interface EncryptionProvider {
  encrypt(secret: string): EncryptedCredential;
  decrypt(value: EncryptedCredential): string;
}

export class AesGcmEncryptionProvider implements EncryptionProvider {
  constructor(private readonly key: Buffer, private readonly keyVersion: number) {
    if (key.length !== 32) throw new Error("API credential encryption key must decode to exactly 32 bytes.");
  }

  encrypt(secret: string): EncryptedCredential {
    if (!secret) throw new Error("Cannot encrypt an empty API credential.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      encryptedSecret: encrypted.toString("base64"),
      encryptionIv: iv.toString("base64"),
      encryptionAuthTag: cipher.getAuthTag().toString("base64"),
      encryptionKeyVersion: this.keyVersion
    };
  }

  decrypt(value: EncryptedCredential): string {
    if (value.encryptionKeyVersion !== this.keyVersion) {
      throw credentialDecryptionError();
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(value.encryptionIv, "base64"));
      decipher.setAuthTag(Buffer.from(value.encryptionAuthTag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(value.encryptedSecret, "base64")), decipher.final()]).toString("utf8");
    } catch {
      throw credentialDecryptionError();
    }
  }
}

export function getCredentialEncryptionProvider() {
  const env = getServerEnv();
  if (!env.apiCredentialEncryptionKey) {
    throw Object.assign(new Error("BYOK 加密主密钥未配置，连接自己的 API 功能已禁用。"), { status: 503, code: "BYOK_ENCRYPTION_NOT_CONFIGURED" });
  }
  const key = decodeMasterKey(env.apiCredentialEncryptionKey);
  return new AesGcmEncryptionProvider(key, env.apiCredentialEncryptionKeyVersion);
}

export function isCredentialEncryptionConfigured() {
  try {
    getCredentialEncryptionProvider();
    return true;
  } catch {
    return false;
  }
}

function decodeMasterKey(value: string) {
  const trimmed = value.trim();
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length !== 32) throw new Error("API credential encryption key must be 32 random bytes encoded as base64 or 64 hex characters.");
  return decoded;
}

function credentialDecryptionError() {
  return new ProviderExecutionError(
    "CREDENTIAL_DECRYPTION_FAILED",
    "CREDENTIAL_VAULT",
    "GENERATION",
    "API 连接无法安全解密，请删除后重新连接。",
    false,
    true,
    409
  );
}
