export type CredentialErrorCode =
  | "USER_API_KEY_INVALID"
  | "USER_API_QUOTA_EXCEEDED"
  | "USER_API_RATE_LIMITED"
  | "USER_MODEL_NOT_FOUND"
  | "USER_MODEL_NOT_ALLOWED"
  | "USER_MODEL_UNSUPPORTED"
  | "USER_CREDENTIAL_EXPIRED"
  | "USER_CREDENTIAL_REVOKED"
  | "CREDENTIAL_DECRYPTION_FAILED"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_TEMPORARILY_UNAVAILABLE"
  | "PLATFORM_API_UNAVAILABLE";

export type ProviderErrorKind = "SEARCH" | "GENERATION";

export class ProviderExecutionError extends Error {
  readonly status: number;

  constructor(
    readonly code: CredentialErrorCode,
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    readonly safeMessage: string,
    readonly retryable: boolean,
    readonly actionRequired: boolean,
    status = 502
  ) {
    super(safeMessage);
    this.name = "ProviderExecutionError";
    this.status = status;
  }
}

export function mapProviderHttpError(input: {
  provider: string;
  kind: ProviderErrorKind;
  status: number;
  credentialSource?: "PLATFORM" | "USER_PROVIDED";
  responseCode?: string | null;
}): ProviderExecutionError {
  const userCredential = input.credentialSource === "USER_PROVIDED";
  const codeText = (input.responseCode ?? "").toLowerCase();

  if (input.status === 401 || input.status === 403) {
    const modelAccess = input.kind === "GENERATION" && /model|permission|access|not.?allowed/.test(codeText);
    return new ProviderExecutionError(
      userCredential ? (modelAccess ? "USER_MODEL_NOT_ALLOWED" : "USER_API_KEY_INVALID") : "PLATFORM_API_UNAVAILABLE",
      input.provider,
      input.kind,
      userCredential
        ? modelAccess
          ? "当前 API Key 没有使用所选模型的权限，请更换模型或更新连接。"
          : "API Key 无效或没有访问权限，请更新连接。"
        : "RealNeed 平台 API 暂时不可用。",
      false,
      userCredential,
      input.status
    );
  }

  if (input.status === 404 && input.kind === "GENERATION") {
    return new ProviderExecutionError(
      userCredential ? "USER_MODEL_NOT_FOUND" : "PLATFORM_API_UNAVAILABLE",
      input.provider,
      input.kind,
      userCredential ? "所选模型不存在或当前账号无法访问。" : "RealNeed 平台模型暂时不可用。",
      false,
      userCredential,
      404
    );
  }

  if (input.status === 402 || /quota|insufficient|billing|balance/.test(codeText)) {
    return new ProviderExecutionError(
      userCredential ? "USER_API_QUOTA_EXCEEDED" : "PLATFORM_API_UNAVAILABLE",
      input.provider,
      input.kind,
      userCredential ? "当前第三方 API 额度不足，请充值或更换连接。" : "RealNeed 平台 API 额度暂时不可用。",
      false,
      userCredential,
      402
    );
  }

  if (input.status === 429) {
    return new ProviderExecutionError(
      userCredential ? "USER_API_RATE_LIMITED" : "PLATFORM_API_UNAVAILABLE",
      input.provider,
      input.kind,
      userCredential ? "第三方 API 当前触发限流，可以稍后重试或更换连接。" : "RealNeed 平台 API 当前触发限流。",
      true,
      userCredential,
      429
    );
  }

  return new ProviderExecutionError(
    userCredential ? "PROVIDER_TEMPORARILY_UNAVAILABLE" : "PLATFORM_API_UNAVAILABLE",
    input.provider,
    input.kind,
    userCredential ? "第三方供应商暂时不可用，请稍后重试。" : "RealNeed 平台 API 暂时不可用。",
    input.status >= 500,
    false,
    input.status
  );
}

export function providerResponseInvalid(provider: string, kind: ProviderErrorKind) {
  return new ProviderExecutionError(
    "PROVIDER_RESPONSE_INVALID",
    provider,
    kind,
    "供应商返回了无法验证的响应结构，本次任务已停止，没有使用模板兜底。",
    false,
    true,
    502
  );
}

export function isProviderExecutionError(error: unknown): error is ProviderExecutionError {
  return error instanceof ProviderExecutionError;
}
