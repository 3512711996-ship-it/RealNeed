import { CopyButton } from "@/components/CopyButton";
import { RealNeedLogo } from "@/components/RealNeedLogo";
import type { DeepDiveReport as DeepDiveReportType, EvidenceExecutionReport, IdeaSignalRepairReport } from "@/lib/types";
import type { ReactNode } from "react";

export function DeepDiveReport({ report }: { report: DeepDiveReportType }) {
  if (report.mode === "IDEA_SIGNAL_REPAIR") {
    return <IdeaSignalRepairReportView report={report} />;
  }

  return <EvidenceExecutionReportView report={report as EvidenceExecutionReport} />;
}

function EvidenceExecutionReportView({ report }: { report: EvidenceExecutionReport }) {
  return (
    <article className="mx-auto max-w-[1120px] px-4 py-8 text-ink sm:px-6">
      <section className="rounded-[12px] border border-line bg-white p-5 shadow-paper sm:p-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-[9px] border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-paper">
            <RealNeedLogo className="h-5 w-5" />
          </span>
          RealNeed
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">Deep Dive Report</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight sm:text-[52px]">{report.recommendation.productName}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-graphite">{report.recommendation.oneSentence}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Badge label="推荐置信度" value={report.recommendation.confidence} />
          <Badge label="证据来源" value={`${report.evidenceSourceIds.length} 条`} />
          <Badge label="生成时间" value={new Date(report.generatedAt).toLocaleString("zh-CN")} />
        </div>
      </section>

      <Section title="为什么先验证它">
        <p>{report.recommendation.whyThisOne}</p>
        {report.recommendation.whyNotTheOthers.length ? (
          <div className="mt-4 grid gap-3">
            {report.recommendation.whyNotTheOthers.map((item) => (
              <div key={item.opportunityName} className="rounded-[8px] border border-line bg-paper p-3">
                <p className="font-semibold">{item.opportunityName}</p>
                <p className="mt-1 text-sm leading-6 text-helper">{item.reason}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="精确目标用户">
        <Grid fields={[
          ["谁最可能使用", report.targetUser.description],
          ["具体场景", report.targetUser.specificScene],
          ["当前替代方式", report.targetUser.currentAlternative],
          ["替代方式的问题", report.targetUser.alternativeProblem]
        ]} />
      </Section>

      <Section title="1-3 天 MVP">
        <Grid fields={[
          ["目标", report.mvpPlan.goal],
          ["产品形式", report.mvpPlan.productForm],
          ["预计构建时间", report.mvpPlan.estimatedBuildTime],
          ["人工交付方案", report.mvpPlan.manualDeliveryOption]
        ]} />
        <ListBlock title="页面结构" items={report.mvpPlan.pages.map((page) => `${page.pageName}：${page.purpose}（${page.sections.join(" / ")}）`)} />
        <ListBlock title="核心输入" items={report.mvpPlan.coreInputs} />
        <ListBlock title="核心输出" items={report.mvpPlan.coreOutputs} />
        <ListBlock title="用户流程" items={report.mvpPlan.userFlow} />
        <ListBlock title="推荐技术栈" items={report.mvpPlan.techStack} />
      </Section>

      <Section title="第一版不要做">
        <ListBlock title="doNotBuildYet" items={report.mvpPlan.doNotBuildYet} tone="risk" />
      </Section>

      <Section title="第一批用户地图">
        <div className="grid gap-4">
          {report.firstUserMap.platforms.map((platform) => (
            <div key={platform.platform} className="rounded-[10px] border border-line bg-paper p-4">
              <h3 className="text-lg font-semibold">{platform.platform}</h3>
              <p className="mt-1 text-sm leading-6 text-helper">{platform.reason}</p>
              <ListBlock title="搜索关键词" items={platform.searchKeywords} />
              <ListBlock title="目标帖子信号" items={platform.targetPostSignals} />
              <ListBlock title="非目标信号" items={platform.nonTargetSignals} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="冷启动话术">
        <ScriptBlock title="评论话术" value={report.outreachScripts.publicComment} />
        <ScriptBlock title="私信话术" value={report.outreachScripts.directMessage} />
        <ScriptBlock title="跟进话术" value={report.outreachScripts.followUp} />
        <ScriptBlock title="收费测试话术" value={report.outreachScripts.paymentTest} />
      </Section>

      <Section title="今天只做这一步">
        <Grid fields={[
          ["标题", report.todayAction.title],
          ["今天产出", report.todayAction.expectedOutput],
          ["成功指标", report.todayAction.successMetric],
          ["停止条件", report.todayAction.stopCondition]
        ]} />
        <ListBlock title="具体任务" items={report.todayAction.tasks} />
      </Section>

      <Section title="三天验证计划">
        <div className="grid gap-3">
          {report.threeDayValidationPlan.map((day) => (
            <div key={day.day} className="rounded-[10px] border border-line bg-paper p-4">
              <p className="font-mono text-sm font-semibold text-helper">Day {day.day}</p>
              <h3 className="mt-1 text-xl font-semibold">{day.objective}</h3>
              <ListBlock title="任务" items={day.tasks} />
              <Grid fields={[
                ["产出", day.output],
                ["成功指标", day.successMetric],
                ["停止条件", day.stopCondition]
              ]} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="收费测试">
        <Grid fields={[
          ["免费测试怎么说", report.pricingTest.freeTestOffer],
          ["第一次收费怎么提出", report.pricingTest.firstPaidOffer],
          ["建议价格", report.pricingTest.suggestedPrice],
          ["要问的问题", report.pricingTest.questionToAsk],
          ["有效付费信号", report.pricingTest.validPaymentSignal],
          ["无效信号", report.pricingTest.invalidPaymentSignal]
        ]} />
      </Section>

      <Section title="风险和停止条件">
        <div className="grid gap-3">
          {report.risks.map((risk) => (
            <div key={risk.risk} className="rounded-[8px] border border-clay/30 bg-clay/10 p-3 text-clay">
              <p className="font-semibold">{risk.risk}</p>
              <p className="mt-1 text-sm leading-6">{risk.whyItMatters}</p>
              <p className="mt-1 text-sm leading-6">处理：{risk.mitigation}</p>
            </div>
          ))}
        </div>
        <ListBlock title="最终停止条件" items={report.finalStopConditions} tone="risk" />
      </Section>

      <Section title="直接复制给 Codex 开始做 MVP">
        <div className="rounded-[10px] border border-line bg-ink p-4 text-paper">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Codex Prompt</p>
            <CopyButton value={report.codexPrompt} label="复制提示词" />
          </div>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-paper/78">{report.codexPrompt}</pre>
        </div>
      </Section>
    </article>
  );
}

function IdeaSignalRepairReportView({ report }: { report: IdeaSignalRepairReport }) {
  return (
    <article className="mx-auto max-w-[1120px] px-4 py-8 text-ink sm:px-6">
      <section className="rounded-[12px] border border-line bg-white p-5 shadow-paper sm:p-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-[9px] border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-paper">
            <RealNeedLogo className="h-5 w-5" />
          </span>
          RealNeed
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-helper">Idea Signal Repair</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight sm:text-[52px]">{report.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-graphite">{report.disclaimer}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Badge label="报告类型" value="想法补足型" />
          <Badge label="证据来源" value={`${report.evidenceSourceIds.length} 条`} />
          <Badge label="生成时间" value={new Date(report.generatedAt).toLocaleString("zh-CN")} />
        </div>
      </section>

      <Section title="当前为什么不能算验证通过">
        <Grid
          fields={[
            ["技术状态", report.currentVerdict.technicalOutcome],
            ["市场判断", report.currentVerdict.marketVerdict],
            ["原因", report.currentVerdict.whyNotValidated],
            ["下一步", "先补证，不先做完整产品"]
          ]}
        />
      </Section>

      <Section title="证据缺口地图">
        <div className="grid gap-3">
          {report.evidenceGapMap.map((gap) => (
            <div key={gap.gap} className="rounded-[8px] border border-line bg-paper p-3">
              <p className="font-semibold">{gap.gap}</p>
              <p className="mt-1 text-sm leading-6 text-helper">{gap.whyItMatters}</p>
              <p className="mt-1 text-sm leading-6 text-graphite">怎么补：{gap.howToFill}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="重构成可验证假设">
        <div className="grid gap-3">
          {report.reconstructedHypotheses.map((item) => (
            <div key={`${item.targetUser}-${item.painHypothesis}`} className="rounded-[8px] border border-line bg-paper p-3">
              <p className="font-semibold">{item.targetUser}</p>
              <p className="mt-1 text-sm leading-6 text-graphite">痛点假设：{item.painHypothesis}</p>
              <p className="mt-1 text-sm leading-6 text-helper">高风险假设：{item.riskyAssumption}</p>
              <p className="mt-1 text-sm leading-6 text-helper">有效信号：{item.validationSignal}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="搜索和找人计划">
        <div className="grid gap-4">
          {report.searchPlan.map((platform) => (
            <div key={platform.platform} className="rounded-[10px] border border-line bg-paper p-4">
              <h3 className="text-lg font-semibold">{platform.platform}</h3>
              <ListBlock title="搜索词" items={platform.queries} />
              <ListBlock title="目标信号" items={platform.targetSignals} />
              <ListBlock title="排除信号" items={platform.rejectSignals} tone="risk" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="访谈问题">
        <Grid fields={[["先问谁", report.interviewPlan.whoToAsk]]} />
        <ListBlock title="问题" items={report.interviewPlan.questions} />
        <ListBlock title="有效回答" items={report.interviewPlan.validAnswers} />
        <ListBlock title="无效回答" items={report.interviewPlan.invalidAnswers} tone="risk" />
      </Section>

      <Section title="手动交付和预售测试">
        <Grid
          fields={[
            ["测试 offer", report.manualDeliveryTest.offer],
            ["有效付费信号", report.manualDeliveryTest.validPaymentSignal],
            ["无效信号", report.manualDeliveryTest.invalidPaymentSignal]
          ]}
        />
        <ListBlock title="交付步骤" items={report.manualDeliveryTest.deliverySteps} />
        <ScriptBlock title="预售话术" value={report.manualDeliveryTest.presaleScript} />
      </Section>

      <Section title="三天补证计划">
        <div className="grid gap-3">
          {report.threeDayRepairPlan.map((day) => (
            <div key={day.day} className="rounded-[10px] border border-line bg-paper p-4">
              <p className="font-mono text-sm font-semibold text-helper">Day {day.day}</p>
              <h3 className="mt-1 text-xl font-semibold">{day.objective}</h3>
              <ListBlock title="任务" items={day.tasks} />
              <Grid
                fields={[
                  ["产出", day.output],
                  ["继续条件", day.continueIf],
                  ["停止条件", day.stopIf]
                ]}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="最终判断规则">
        <ListBlock title="继续" items={report.finalDecisionRules.continueRules} />
        <ListBlock title="停止" items={report.finalDecisionRules.stopRules} tone="risk" />
        <ListBlock title="换角度" items={report.finalDecisionRules.reframeRules} />
      </Section>

      <Section title="直接复制给 Codex 做验证工具">
        <div className="rounded-[10px] border border-line bg-ink p-4 text-paper">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Codex Prompt</p>
            <CopyButton value={report.codexPrompt} label="复制提示词" />
          </div>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-paper/78">{report.codexPrompt}</pre>
        </div>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-[10px] border border-line bg-white p-5 shadow-paper">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-graphite">{children}</div>
    </section>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-line bg-paper p-3">
      <p className="text-xs text-helper">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Grid({ fields }: { fields: [string, string][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="rounded-[8px] border border-line bg-paper p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-helper">{label}</p>
          <p className="mt-1 text-sm leading-6 text-graphite">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ListBlock({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "risk" }) {
  return (
    <div className={`mt-4 rounded-[8px] border p-3 ${tone === "risk" ? "border-clay/30 bg-clay/10 text-clay" : "border-line bg-paper text-graphite"}`}>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 grid gap-1 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ScriptBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-3 rounded-[8px] border border-line bg-paper p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <CopyButton value={value} label="复制" />
      </div>
      <p>{value}</p>
    </div>
  );
}
