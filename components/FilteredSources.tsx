import { Clock3, FileQuestion, FileX2, ShieldAlert, TimerOff } from "lucide-react";
import { formatDirectVerificationReason, verificationOriginLabel, verificationStatusLabel } from "@/lib/source-display";
import type { ScannedSource, SourceVerificationStatus } from "@/lib/types";

const groups: {
  key: string;
  title: string;
  statuses: SourceVerificationStatus[];
  description: string;
  icon: typeof FileX2;
}[] = [
  {
    key: "blocked",
    title: "被网站拦截",
    statuses: ["BLOCKED", "RATE_LIMITED", "REDIRECT_BLOCKED"],
    description: "该页面可能可以在浏览器中打开，但拒绝了 RealNeed 服务端的自动访问，因此暂不计入有效证据。",
    icon: ShieldAlert
  },
  {
    key: "not-found",
    title: "已失效来源",
    statuses: ["NOT_FOUND", "INVALID_URL"],
    description: "这些来源返回 404、410 或 URL 无效，不能作为 evidence。",
    icon: FileX2
  },
  {
    key: "network",
    title: "超时或网络错误",
    statuses: ["TIMEOUT", "NETWORK_ERROR"],
    description: "这些来源本轮没有成功读取正文，不能基于它们编造信号。",
    icon: TimerOff
  },
  {
    key: "unsupported",
    title: "不支持的内容",
    statuses: ["UNSUPPORTED_CONTENT", "BODY_TOO_LARGE"],
    description: "这些来源不是可处理的文本内容，或响应体超过安全上限，已排除。",
    icon: FileQuestion
  },
  {
    key: "unverified",
    title: "本次尚未验证",
    statuses: ["UNVERIFIED"],
    description: "尚未执行或尚未完成独立直接 URL 验证；这不代表链接失效，但当前不能计入正式证据。",
    icon: Clock3
  }
];

export function FilteredSources({ sources }: { sources: ScannedSource[] }) {
  if (sources.length === 0) return null;

  const grouped = groups
    .map((group) => ({
      ...group,
      sources: sources.filter((source) => group.statuses.includes(source.verificationStatus ?? "NETWORK_ERROR"))
    }))
    .filter((group) => group.sources.length > 0);

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
      <details className="rounded-[10px] border border-line bg-white p-4 shadow-paper">
        <summary className="cursor-pointer text-sm font-semibold text-ink">查看未计入强证据的来源（{sources.length}）</summary>
        <p className="mt-3 text-sm leading-6 text-helper">
          只有 ACCESSIBLE 或 REDIRECTED_ACCESSIBLE 且取得正文的来源可以参与完整需求信号判断。下面这些来源仍保留追溯信息，但不会被包装成强证据。
        </p>
        <div className="mt-4 grid gap-4">
          {grouped.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.key} className="rounded-[8px] border border-line bg-paper p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-ink/10 bg-white text-ink">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      {group.title}（{group.sources.length}）
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-helper">{group.description}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3">
                  {group.sources.map((source) => (
                    <SourceRow key={source.id} source={source} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}

function SourceRow({ source }: { source: ScannedSource }) {
  return (
    <div className="rounded-[8px] border border-line bg-white p-3">
      <h4 className="text-sm font-semibold leading-6 text-ink">{source.title}</h4>
      <p className="break-all text-xs leading-5 text-helper">{source.finalUrl ?? source.url}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded-[6px] border border-line bg-paper px-2 py-1 text-helper">
          验证状态：{verificationStatusLabel(source.verificationStatus)}
        </span>
        {source.statusCode ? <span className="rounded-[6px] border border-line bg-paper px-2 py-1 text-helper">HTTP {source.statusCode}</span> : null}
        {source.verificationOrigin ? (
          <span className="rounded-[6px] border border-line bg-paper px-2 py-1 text-helper">
            {verificationOriginLabel(source.verificationOrigin)}
          </span>
        ) : null}
        {typeof source.durationMs === "number" ? <span className="rounded-[6px] border border-line bg-paper px-2 py-1 text-helper">{source.durationMs}ms</span> : null}
      </div>
      {source.failureReason ? (
        <p className="mt-2 text-xs leading-5 text-helper">
          {formatDirectVerificationReason(source.failureReason, source.verificationStatus, source.statusCode)}
        </p>
      ) : null}
    </div>
  );
}
