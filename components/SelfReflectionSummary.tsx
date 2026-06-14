"use client";

import {
  generateSummary,
  type SelfReflectionSummary as SRType,
} from "@/lib/self-reflection";
import { useEffect, useState } from "react";

/**
 * 把系统内部的六论·七自·进化引擎·三层自反数据，翻译成一段可阅读的文字，
 * 显示在生成的代码上方。
 */
export default function SelfReflectionSummaryBlock({
  prompt,
  latestCode,
  refreshKey,
}: {
  prompt: string;
  latestCode: string;
  refreshKey?: number;
}) {
  const [summary, setSummary] = useState<SRType | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const s = generateSummary(prompt, latestCode);
      setSummary(s);
    } catch (e) {
      // 自省摘要出错时不应该影响主流程
      setSummary(null);
    }
  }, [prompt, latestCode, refreshKey]);

  if (!summary) return null;

  return (
    <div className="border-b border-neutral-800/60 bg-neutral-950 text-neutral-300">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="text-neutral-400">自省摘要</span>
          <span className="text-neutral-600">·</span>
          <span className="text-neutral-200">{summary.headline}</span>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge level={summary.confidenceLabel} status={summary.overallStatus} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-3 text-[12.5px] leading-relaxed">
          <div className="space-y-2 text-neutral-400">
            {summary.overallParagraphs.map((p, i) => (
              <p key={`op-${i}`} className="text-neutral-500">{p}</p>
            ))}
            <p className="text-amber-400/80">{summary.riskParagraph}</p>
            <p className="text-neutral-400">{summary.geneParagraph}</p>
            <p className="text-neutral-400">{summary.selfReflectiveText}</p>
            <p className="text-neutral-500">{summary.doubtParagraph}</p>
            <p className="text-neutral-300 bg-neutral-900/40 rounded-md px-2 py-1.5 border border-neutral-800/40">
              {summary.suggestionParagraph}
            </p>
          </div>

          {summary.topWarnings.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] text-red-400/80">内部告警</div>
              {summary.topWarnings.slice(0, 3).map((w, i) => (
                <div key={`warn-${i}`} className="text-[11.5px] text-red-300/70 pl-3">
                  · {w}
                </div>
              ))}
            </div>
          )}

          {summary.humilityTokens.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] text-amber-500/70">谦逊标记</div>
              {summary.humilityTokens.map((h, i) => (
                <div key={`hum-${i}`} className="text-[11.5px] text-amber-400/70 pl-3">
                  · {h}
                </div>
              ))}
            </div>
          )}

          {summary.topPatternNames.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] text-neutral-500">跨模块模式</div>
              <div className="text-[11.5px] text-neutral-400 pl-3">
                · {summary.topPatternNames.slice(0, 4).join(" · ")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({
  level,
  status,
}: {
  level: string;
  status: string;
}) {
  // 颜色依自信程度从绿→黄→橙→红
  let cls =
    "px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors ";
  if (status === "康" && level === "坦诚告知") {
    cls += "border-emerald-700/60 text-emerald-300 bg-emerald-950/40";
  } else if (status === "平") {
    cls += "border-yellow-700/50 text-yellow-200/80 bg-yellow-950/30";
  } else if (status === "损") {
    cls += "border-orange-700/50 text-orange-200/80 bg-orange-950/30";
  } else {
    cls += "border-red-700/60 text-red-300 bg-red-950/40";
  }
  return <span className={cls}>{level}</span>;
}
