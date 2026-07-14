import { BadgeAlert } from "lucide-react";
import type { ProductOpportunity } from "@/lib/types";

export function SkepticReview({ opportunity }: { opportunity: ProductOpportunity }) {
  const primaryRisk = opportunity.risks[0] ?? "最大风险还没有被充分验证，所以第一版必须保持很轻。";

  return (
    <section className="rounded-[8px] border border-clay/25 bg-clay/8 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <BadgeAlert className="h-4 w-4 text-clay" />
        冷静审查
      </div>
      <p className="text-sm leading-7 text-graphite">
        这个方向不是稳赚。最大风险是：{primaryRisk} 所以第一版不要做重系统，先用低成本验证动作确认用户是否真的愿意配合。
      </p>
    </section>
  );
}
