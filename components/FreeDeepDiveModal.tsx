"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DeepDiveMode } from "@/lib/types";

type Credential = { id: string; kind: "GENERATION"; provider: string; status: "ACTIVE"; keyLastFour: string; selectedModel: string | null };

export function FreeDeepDiveModal({ open, onOpenChange, judgmentId, mode }: { open: boolean; onOpenChange: (value: boolean) => void; judgmentId?: string; mode?: DeepDiveMode | null }) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selected = useMemo(() => credentials.find((item) => item.id === selectedId), [credentials, selectedId]);

  useEffect(() => {
    if (!open) return;
    setError("");
    void fetch("/api/api-connections", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取 API 连接状态。");
        return response.json() as Promise<{ csrfToken: string; credentials: Credential[] }>;
      })
      .then((payload) => {
        const active = payload.credentials.filter((item) => item.kind === "GENERATION" && item.status === "ACTIVE");
        setCredentials(active);
        setCsrfToken(payload.csrfToken);
        setSelectedId(active[0]?.id ?? "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "API 连接状态读取失败。"));
  }, [open]);

  async function createReport() {
    if (!judgmentId || !mode || !selected || !csrfToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/judgments/${encodeURIComponent(judgmentId)}/deep-dive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          mode,
          generation: { credentialSource: "USER_PROVIDED", provider: selected.provider, model: selected.selectedModel, credentialId: selected.id, configurationVersion: 1 }
        })
      });
      const payload = (await response.json()) as { jobId?: string; message?: string };
      if (!response.ok || !payload.jobId) throw new Error(payload.message ?? "无法创建免费报告任务。");
      window.sessionStorage.setItem(`realneed:deep-dive-job:${judgmentId}`, payload.jobId);
      onOpenChange(false);
      window.dispatchEvent(new CustomEvent("realneed:deep-dive-queued", { detail: { jobId: payload.jobId } }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法创建免费报告任务。");
    } finally {
      setLoading(false);
    }
  }

  const repair = mode === "IDEA_SIGNAL_REPAIR";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] bg-paper p-5">
        <DialogTitle className="text-xl font-semibold text-ink">免费生成{repair ? "想法补足报告" : "执行型 Deep Dive"}</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-graphite">
          RealNeed 不收取报告费用。此任务会使用你选定的生成模型 API，第三方费用由你的 API 账户按供应商规则结算。
        </DialogDescription>
        {repair ? <p className="rounded-[7px] border border-straw/50 bg-straw/15 p-3 text-xs leading-5 text-ink">本报告用于补充证据和验证假设，不代表 RealNeed 已确认真实需求或付费意愿。</p> : null}
        <label className="grid gap-1.5 text-xs font-semibold text-helper">生成模型 API
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="field-select" disabled={loading || credentials.length === 0}>
            {credentials.length === 0 ? <option value="">没有可用生成模型连接</option> : null}
            {credentials.map((item) => <option key={item.id} value={item.id}>{item.provider} · {item.selectedModel ?? "默认模型"} · ****{item.keyLastFour}</option>)}
          </select>
        </label>
        <p className="text-xs leading-5 text-helper">默认不执行新的搜索，只复用本次免费判断已保存的合格证据或证据缺口。</p>
        {error ? <p className="rounded-[7px] border border-clay/30 bg-clay/10 p-3 text-xs leading-5 text-ink">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <a href="/api-connections" className="inline-flex h-10 items-center rounded-[7px] border border-line px-3 text-sm font-semibold text-ink">管理 API 连接</a>
          <Button type="button" variant="accent" onClick={createReport} disabled={loading || !selected}>{loading ? "正在创建任务..." : "免费生成报告"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
