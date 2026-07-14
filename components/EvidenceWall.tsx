"use client";

import { motion } from "framer-motion";
import { EvidenceCard } from "@/components/EvidenceCard";
import type { EvidenceSource } from "@/lib/types";

export function EvidenceWall({ evidence }: { evidence: EvidenceSource[] }) {
  return (
    <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-helper">Evidence Wall</p>
          <h2 className="mt-1 text-[30px] font-semibold leading-tight text-ink sm:text-[38px]">先看真实需求线索</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-helper">下面这些不是产品建议，而是用户已经表达过的问题。</p>
        </div>
        <span className="rounded-[6px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">{evidence.length} 条线索入墙</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {evidence.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.28 }}
          >
            <EvidenceCard evidence={item} index={index} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
