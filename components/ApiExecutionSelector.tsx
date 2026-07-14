"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CredentialKind = "SEARCH" | "GENERATION";
type CredentialSource = "PLATFORM" | "USER_PROVIDED";

export type ClientExecutionSelection = {
  search: {
    credentialSource: CredentialSource;
    provider: "TAVILY" | "BRAVE" | "EXA" | "PERPLEXITY_SEARCH";
    credentialId: string | null;
    configurationVersion: number;
  };
  generation: {
    credentialSource: CredentialSource;
    provider: "MOONSHOT" | "OPENAI" | "ANTHROPIC" | "GOOGLE_GEMINI" | "DEEPSEEK" | "QWEN";
    model: string;
    credentialId: string | null;
    configurationVersion: number;
  };
};

type SafeCredential = {
  id: string;
  kind: CredentialKind;
  provider: string;
  status: "ACTIVE" | "INVALID" | "EXPIRED" | "PENDING_VERIFICATION" | "REVOKED";
  keyLastFour: string;
  selectedModel: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string;
};

type ProvidersPayload = {
  byokEnabled: boolean;
  searchProviders: Array<{ provider: ClientExecutionSelection["search"]["provider"]; displayName: string }>;
  generationProviders: Array<{
    provider: ClientExecutionSelection["generation"]["provider"];
    displayName: string;
    models: Array<{ modelId: string; displayName: string; enabled: boolean }>;
  }>;
};

type ConnectionsPayload = {
  credentials: SafeCredential[];
  csrfToken: string;
};

export function ApiExecutionSelector({
  disabled,
  requireSearchCredential = true,
  onSessionReady,
  onExecutionChange
}: {
  disabled?: boolean;
  requireSearchCredential?: boolean;
  onSessionReady: (csrfToken: string | null) => void;
  onExecutionChange: (execution: ClientExecutionSelection | undefined) => void;
}) {
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [credentials, setCredentials] = useState<SafeCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchCredentialId, setSearchCredentialId] = useState("platform");
  const [generationCredentialId, setGenerationCredentialId] = useState("platform");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [providersResponse, connectionsResponse] = await Promise.all([
          fetch("/api/providers", { cache: "no-store" }),
          fetch("/api/api-connections", { cache: "no-store" })
        ]);
        if (!providersResponse.ok) throw new Error("无法读取供应商目录。");
        if (!connectionsResponse.ok) throw new Error("无法读取 API 连接状态。");
        const providersPayload = (await providersResponse.json()) as ProvidersPayload;
        const connectionsPayload = (await connectionsResponse.json()) as ConnectionsPayload;
        if (cancelled) return;
        setProviders(providersPayload);
        setCredentials(connectionsPayload.credentials.filter((item) => item.status !== "REVOKED"));
        onSessionReady(connectionsPayload.csrfToken);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "API 连接状态读取失败。");
        onSessionReady(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [onSessionReady]);

  const activeSearchCredentials = useMemo(() => credentials.filter((item) => item.kind === "SEARCH" && item.status === "ACTIVE"), [credentials]);
  const activeGenerationCredentials = useMemo(() => credentials.filter((item) => item.kind === "GENERATION" && item.status === "ACTIVE"), [credentials]);

  useEffect(() => {
    const searchCredential = activeSearchCredentials.find((item) => item.id === searchCredentialId) ?? null;
    const generationCredential = activeGenerationCredentials.find((item) => item.id === generationCredentialId) ?? null;

    if (!generationCredential) return onExecutionChange(undefined);
    if (requireSearchCredential && !searchCredential) return onExecutionChange(undefined);
    if (searchCredentialId !== "platform" && !searchCredential) return onExecutionChange(undefined);

    onExecutionChange({
      search: searchCredential
        ? {
            credentialSource: "USER_PROVIDED",
            provider: searchCredential.provider as ClientExecutionSelection["search"]["provider"],
            credentialId: searchCredential.id,
            configurationVersion: 1
          }
        : { credentialSource: "PLATFORM", provider: "TAVILY", credentialId: null, configurationVersion: 1 },
      generation: generationCredential
        ? {
            credentialSource: "USER_PROVIDED",
            provider: generationCredential.provider as ClientExecutionSelection["generation"]["provider"],
            model: generationCredential.selectedModel ?? "",
            credentialId: generationCredential.id,
            configurationVersion: 1
          }
        : { credentialSource: "PLATFORM", provider: "MOONSHOT", model: "kimi-k2.5", credentialId: null, configurationVersion: 1 }
    });
  }, [activeGenerationCredentials, activeSearchCredentials, generationCredentialId, onExecutionChange, requireSearchCredential, searchCredentialId]);

  const providerLabel = (provider: string) => {
    const search = providers?.searchProviders.find((item) => item.provider === provider)?.displayName;
    const generation = providers?.generationProviders.find((item) => item.provider === provider)?.displayName;
    return search ?? generation ?? provider;
  };

  return (
    <section className="rounded-[8px] border border-line bg-paper/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound className="h-4 w-4" />
          API 执行方式
        </div>
        <a href="/api-connections" className="text-xs font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          管理连接
        </a>
      </div>

      {error ? <p className="mb-3 rounded-[6px] border border-clay/25 bg-clay/10 px-3 py-2 text-xs leading-5 text-ink">{error}</p> : null}
      {!providers?.byokEnabled && !loading ? (
        <p className="mb-3 rounded-[6px] border border-straw/50 bg-straw/15 px-3 py-2 text-xs leading-5 text-ink">
          BYOK 加密主密钥尚未配置，不能保存用户自己的 Key，也不能启动扫描。请由实例管理员先完成服务端加密配置。
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <ProviderSelect
          label="搜索 API"
          value={searchCredentialId}
          disabled={disabled || loading}
          credentials={activeSearchCredentials}
          providerLabel={providerLabel}
          platformLabel="手动粘贴不调用搜索 API"
          allowPlatform={!requireSearchCredential}
          onChange={setSearchCredentialId}
        />
        <ProviderSelect
          label="生成模型 API"
          value={generationCredentialId}
          disabled={disabled || loading}
          credentials={activeGenerationCredentials}
          providerLabel={providerLabel}
          platformLabel="请选择自己的生成模型 API"
          allowPlatform={false}
          onChange={setGenerationCredentialId}
        />
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-helper">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink" />
        <span>本实例默认只使用你的 API。任务会锁定到该连接；失败时会暂停，不会静默切回平台。</span>
      </div>
    </section>
  );
}

function ProviderSelect({
  label,
  value,
  disabled,
  credentials,
  providerLabel,
  platformLabel,
  allowPlatform,
  onChange
}: {
  label: string;
  value: string;
  disabled?: boolean;
  credentials: SafeCredential[];
  providerLabel: (provider: string) => string;
  platformLabel: string;
  allowPlatform: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-helper">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 rounded-[7px] border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-ink/40 focus:ring-4 focus:ring-lime/25",
          disabled ? "opacity-60" : ""
        )}
      >
        {allowPlatform ? <option value="platform">{platformLabel}</option> : <option value="platform" disabled>{platformLabel}</option>}
        {credentials.map((credential) => (
          <option key={credential.id} value={credential.id}>
            {providerLabel(credential.provider)} {credential.selectedModel ? `· ${credential.selectedModel}` : ""} · ****{credential.keyLastFour}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ResumeCredentialNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-[8px] border border-straw/60 bg-straw/20 p-4 text-sm leading-6 text-ink">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <RefreshCw className="h-4 w-4" />
        任务正在等待你更新 API 连接
      </div>
      <p className="text-helper">请先到 API 连接页重新测试并保存可用 Key，然后回到这里重新提交或恢复任务。系统不会切换到平台 API 代替执行。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api-connections" className="inline-flex h-9 items-center rounded-button bg-ink px-4 text-xs font-semibold text-paper">
          管理 API 连接
        </a>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            重新读取状态
          </Button>
        ) : null}
      </div>
    </div>
  );
}
