"use client";

import { useState } from "react";
import { Link2, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";

export function ReportRecoveryControls({
  reportId,
  recoveryUrl,
  onDeleted
}: {
  reportId: string;
  recoveryUrl: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [reportUrl, setReportUrl] = useState("");
  const [error, setError] = useState("");

  async function deleteReport() {
    const recoveryToken = readRecoveryToken(recoveryUrl);
    if (!recoveryToken) {
      setError("恢复链接格式无效，无法验证删除权限。");
      return;
    }
    if (!window.confirm("确认永久删除这份报告？来源正文、判断报告和 Deep Dive 都会清除，已有访问链接也会失效。")) return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryToken })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "删除失败，请稍后重试。");
      sessionStorage.removeItem(`realneed:recovery:${reportId}`);
      sessionStorage.removeItem("realneed:last-recovery-url");
      sessionStorage.removeItem("realneed:last-judgment");
      onDeleted();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试。");
    } finally {
      setDeleting(false);
    }
  }

  async function updateAccessLink(action: "REGENERATE" | "REVOKE") {
    const recoveryToken = readRecoveryToken(recoveryUrl);
    if (!recoveryToken) { setError("恢复链接格式无效，无法验证操作权限。"); return; }
    setLinkLoading(true); setError("");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/access-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recoveryToken, action }) });
      const payload = (await response.json()) as { message?: string; reportUrl?: string };
      if (!response.ok) throw new Error(payload.message ?? "无法更新报告链接。");
      setReportUrl(payload.reportUrl ?? "");
    } catch (linkError) { setError(linkError instanceof Error ? linkError.message : "无法更新报告链接。"); } finally { setLinkLoading(false); }
  }

  return (
    <section className="mx-auto max-w-[1120px] px-4 pt-5 sm:px-6">
      <div className="flex flex-col gap-4 rounded-[8px] border border-line bg-white p-4 shadow-paper sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
          <div>
            <p className="text-sm font-semibold text-ink">保存恢复链接</p>
            <p className="mt-1 text-xs leading-5 text-helper">换设备后可用此链接恢复报告。报告编号不能单独打开报告，请不要公开恢复链接。</p>
            {reportUrl ? <p className="mt-2 text-xs leading-5 text-helper">新私有链接已生成：<a href={reportUrl} className="font-semibold underline underline-offset-4">打开报告</a></p> : null}
            {error ? <p className="mt-2 text-xs text-clay">{error}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <CopyButton value={recoveryUrl} label="复制恢复链接" copiedLabel="已复制恢复链接" />
          <Button type="button" variant="outline" onClick={() => updateAccessLink("REGENERATE")} disabled={linkLoading} className="gap-2"><RefreshCw className="h-4 w-4" />重新生成私有链接</Button>
          <Button type="button" variant="outline" onClick={() => updateAccessLink("REVOKE")} disabled={linkLoading} className="gap-2"><ShieldOff className="h-4 w-4" />撤销私有链接</Button>
          <Button type="button" variant="outline" onClick={deleteReport} disabled={deleting} className="gap-2 text-clay">
            <Trash2 className="h-4 w-4" />
            {deleting ? "正在删除" : "删除我的报告"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function readRecoveryToken(recoveryUrl: string) {
  try {
    const parsed = new URL(recoveryUrl, window.location.origin);
    const fragmentToken = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
    if (fragmentToken) return fragmentToken;
    const match = parsed.pathname.match(/^\/recover\/([^/]+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
