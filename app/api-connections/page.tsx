"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CredentialKind = "SEARCH" | "GENERATION";

type SafeCredential = {
  id: string;
  kind: CredentialKind;
  provider: string;
  status: "ACTIVE" | "INVALID" | "EXPIRED" | "PENDING_VERIFICATION" | "REVOKED";
  keyLastFour: string;
  selectedModel: string | null;
  lastVerifiedAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
};

type ProvidersPayload = {
  byokEnabled: boolean;
  searchProviders: Array<{ provider: string; displayName: string; liveTestedByRealNeed: boolean }>;
  generationProviders: Array<{
    provider: string;
    displayName: string;
    liveTestedByRealNeed: boolean;
    models: Array<{ modelId: string; displayName: string; enabled: boolean }>;
  }>;
};

type ConnectionsPayload = { credentials: SafeCredential[]; csrfToken: string };

export default function ApiConnectionsPage() {
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [credentials, setCredentials] = useState<SafeCredential[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [kind, setKind] = useState<CredentialKind>("SEARCH");
  const [provider, setProvider] = useState("TAVILY");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testProof, setTestProof] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const generationModels = useMemo(() => providers?.generationProviders.find((item) => item.provider === provider)?.models.filter((item) => item.enabled) ?? [], [provider, providers]);

  useEffect(() => {
    if (kind === "SEARCH") {
      setModel("");
      if (!providers?.searchProviders.some((item) => item.provider === provider)) setProvider(providers?.searchProviders[0]?.provider ?? "TAVILY");
      return;
    }
    const firstGenerationProvider = providers?.generationProviders[0];
    if (!providers?.generationProviders.some((item) => item.provider === provider)) setProvider(firstGenerationProvider?.provider ?? "MOONSHOT");
  }, [kind, provider, providers]);

  useEffect(() => {
    if (kind !== "GENERATION") return;
    if (!generationModels.some((item) => item.modelId === model)) setModel(generationModels[0]?.modelId ?? "");
  }, [generationModels, kind, model]);

  const loadInitialState = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [providersResponse, connectionsResponse] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/api-connections", { cache: "no-store" })
      ]);
      if (!providersResponse.ok) throw new Error("供应商目录读取失败。");
      if (!connectionsResponse.ok) throw new Error("API 连接读取失败。");
      const providersPayload = (await providersResponse.json()) as ProvidersPayload;
      const connectionsPayload = (await connectionsResponse.json()) as ConnectionsPayload;
      setProviders(providersPayload);
      setCredentials(connectionsPayload.credentials.filter((item) => item.status !== "REVOKED"));
      setCsrfToken(connectionsPayload.csrfToken);
      setProvider(providersPayload.searchProviders[0]?.provider ?? "TAVILY");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "页面初始化失败。");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  async function testConnection() {
    setBusy(true);
    setError("");
    setMessage("");
    setTestProof("");
    try {
      const response = await fetch("/api/api-connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ kind, provider, model: kind === "GENERATION" ? model : null, apiKey })
      });
      const payload = (await response.json()) as { status: string; message?: string; testProof?: string; durationMs?: number };
      if (!response.ok || payload.status !== "connected" || !payload.testProof) throw new Error(payload.message ?? "连接测试失败。");
      setTestProof(payload.testProof);
      setMessage(`连接测试通过，用时 ${payload.durationMs ?? 0}ms。现在可以保存。`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "连接测试失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveConnection() {
    setBusy(true);
    setError("");
    try {
      if (!testProof) throw new Error("请先测试连接，通过后再保存。");
      const response = await fetch("/api/api-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ kind, provider, model: kind === "GENERATION" ? model : null, apiKey, testProof })
      });
      const payload = (await response.json()) as { status: string; message?: string };
      if (!response.ok || payload.status !== "connected") throw new Error(payload.message ?? "保存连接失败。");
      setApiKey("");
      setTestProof("");
      setMessage("连接已加密保存。输入框里的 Key 已清空。");
      await loadConnectionsOnly();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存连接失败。");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/api-connections/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken }
      });
      if (!response.ok) throw new Error(await readError(response, "断开连接失败。"));
      setMessage("连接已断开，相关未执行任务会等待你重新选择连接。稍微狠一点，但诚实。");
      await loadConnectionsOnly();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "断开连接失败。");
    } finally {
      setBusy(false);
    }
  }

  async function loadConnectionsOnly() {
    const response = await fetch("/api/api-connections", { cache: "no-store" });
    if (!response.ok) throw new Error("刷新连接列表失败。");
    const payload = (await response.json()) as ConnectionsPayload;
    setCredentials(payload.credentials.filter((item) => item.status !== "REVOKED"));
    setCsrfToken(payload.csrfToken);
  }

  const canSave = Boolean(testProof && apiKey.trim());
  const searchProviders = providers?.searchProviders ?? [];
  const generationProviders = providers?.generationProviders ?? [];

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="paper-grid border-b border-line">
        <div className="mx-auto max-w-[1040px] px-4 py-8 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-helper hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            返回 RealNeed
          </Link>
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 rounded-[6px] border border-line bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-helper">
                <KeyRound className="h-3.5 w-3.5 text-ink" />
                API Connections
              </p>
              <h1 className="mt-4 text-[38px] font-semibold leading-tight sm:text-[52px]">连接你自己的搜索和生成 API</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-graphite">
                RealNeed 会把 Key 加密保存在服务端，并把每个后台任务锁定到你选择的连接。Key 失效时任务暂停，不会静默使用平台 API 代替。
              </p>
            </div>
            <div className="rounded-[8px] border border-line bg-ink p-4 text-sm leading-6 text-paper">
              <p className="font-semibold text-lime">安全边界</p>
              <p className="mt-2 text-paper/78">不支持自定义 Base URL、Endpoint 或 Header；不在浏览器存储 Key；不把 Key 写进日志、URL、HTML 或报告。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1040px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr]">
        <form className="rounded-[10px] border border-line bg-white p-5 shadow-soft" onSubmit={(event) => event.preventDefault()}>
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="text-2xl font-semibold">新增连接</h2>
              <p className="mt-1 text-sm text-helper">先测试，再保存。测试 proof 10 分钟后失效。</p>
            </div>
            <PlugZap className="h-5 w-5 text-ink" />
          </div>

          {!providers?.byokEnabled && !busy ? (
            <div className="mb-4 rounded-[8px] border border-straw/60 bg-straw/20 p-3 text-sm leading-6 text-ink">
              服务端还没有配置 BYOK 加密主密钥，暂时不能保存用户 Key。
            </div>
          ) : null}

          <div className="grid gap-4">
            <SegmentedKind value={kind} onChange={(next) => setKind(next)} />

            <Field label="供应商">
              <select className="field-select" value={provider} onChange={(event) => { setProvider(event.target.value); setTestProof(""); }} disabled={busy}>
                {(kind === "SEARCH" ? searchProviders : generationProviders).map((item) => (
                  <option key={item.provider} value={item.provider}>
                    {item.displayName} {item.liveTestedByRealNeed ? "(RealNeed 已实测)" : "(已实现，未实测)"}
                  </option>
                ))}
              </select>
            </Field>

            {kind === "GENERATION" ? (
              <Field label="模型">
                <select className="field-select" value={model} onChange={(event) => { setModel(event.target.value); setTestProof(""); }} disabled={busy}>
                  {generationModels.map((item) => (
                    <option key={item.modelId} value={item.modelId}>{item.displayName}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="API Key">
              <div className="relative">
                <input
                  value={apiKey}
                  onChange={(event) => { setApiKey(event.target.value); setTestProof(""); }}
                  type={showKey ? "text" : "password"}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="field-input pr-11"
                  placeholder="粘贴供应商 API Key"
                  disabled={busy}
                />
                <button type="button" onClick={() => setShowKey((current) => !current)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[6px] text-helper hover:bg-paper hover:text-ink" aria-label={showKey ? "隐藏 Key" : "显示 Key"}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !apiKey.trim()} onClick={testConnection}>
                <RefreshCw className={cn("h-4 w-4", busy ? "animate-spin" : "")} />
                测试连接
              </Button>
              <Button type="button" variant="accent" disabled={busy || !canSave} onClick={saveConnection}>
                保存加密连接
              </Button>
            </div>
          </div>
        </form>

        <div className="rounded-[10px] border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="text-2xl font-semibold">已连接</h2>
              <p className="mt-1 text-sm text-helper">只显示元数据，不显示密文或完整 Key。</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={loadConnectionsOnly}>刷新</Button>
          </div>

          {error ? <div className="mb-4 rounded-[8px] border border-clay/30 bg-clay/10 p-3 text-sm leading-6 text-ink">{error}</div> : null}
          {message ? <div className="mb-4 rounded-[8px] border border-lime/60 bg-lime/20 p-3 text-sm leading-6 text-ink">{message}</div> : null}

          <div className="grid gap-3">
            {credentials.length ? credentials.map((credential) => (
              <div key={credential.id} className="rounded-[8px] border border-line bg-paper/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[6px] bg-ink px-2 py-1 text-xs font-semibold text-paper">{credential.kind}</span>
                      <span className="font-semibold">{credential.provider}</span>
                      <StatusBadge status={credential.status} />
                    </div>
                    <p className="mt-2 text-sm text-helper">****{credential.keyLastFour}{credential.selectedModel ? ` · ${credential.selectedModel}` : ""}</p>
                    <p className="mt-1 text-xs text-helper">验证：{formatDate(credential.lastVerifiedAt)} · 到期：{formatDate(credential.expiresAt)}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => revoke(credential.id)} className="grid h-9 w-9 place-items-center rounded-[7px] border border-line bg-white text-helper transition hover:border-clay/50 hover:text-clay disabled:opacity-50" aria-label="断开连接">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-[8px] border border-dashed border-line bg-paper/70 p-6 text-center text-sm leading-6 text-helper">
                还没有连接自己的 API。请先连接并验证搜索 API 与生成模型 API，RealNeed 不会使用平台 Key 代替执行。
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function SegmentedKind({ value, onChange }: { value: CredentialKind; onChange: (value: CredentialKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-line bg-paper p-1">
      {(["SEARCH", "GENERATION"] as const).map((item) => (
        <button key={item} type="button" onClick={() => onChange(item)} className={cn("rounded-[7px] px-3 py-2 text-sm font-semibold transition", value === item ? "bg-white text-ink shadow-paper" : "text-helper hover:bg-white/70 hover:text-ink")}>{item === "SEARCH" ? "搜索 API" : "生成 API"}</button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-helper">{label}{children}</label>;
}

function StatusBadge({ status }: { status: SafeCredential["status"] }) {
  const className = status === "ACTIVE" ? "bg-lime/35 text-ink" : status === "INVALID" || status === "EXPIRED" ? "bg-clay/15 text-ink" : "bg-straw/25 text-ink";
  const label = status === "ACTIVE" ? "可用" : status === "INVALID" ? "失效" : status === "EXPIRED" ? "已过期" : "待验证";
  return <span className={cn("rounded-[6px] px-2 py-1 text-xs font-semibold", className)}>{label}</span>;
}

function formatDate(value: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? fallback;
  } catch {
    return fallback;
  }
}
