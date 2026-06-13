"use client";

import { useEffect, useState } from "react";
import {
  type MetaIgnoranceReading,
  buildMetaIgnoranceReading,
} from "../lib/meta-ignorance";

interface Props {
  prompt: string;
  latestCode: string;
  refreshKey: number;
}

// 三指标并列的水平仪表条
function Meter({
  label,
  value,
  color,
  description,
}: {
  label: string;
  value: number;
  color: string;
  description: string;
}) {
  const w = 260;
  const h = 10;
  const pad = 2;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-neutral-300 font-medium">{label}</span>
        <span className="text-[10px] text-neutral-400 tabular-nums">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <svg width={w} height={h + pad * 2} viewBox={`0 0 ${w} ${h + pad * 2}`}>
        <rect
          x={0}
          y={pad}
          width={w}
          height={h}
          fill="#1f2937"
          rx={3}
        />
        <rect
          x={0}
          y={pad}
          width={Math.max(1, w * value)}
          height={h}
          fill={color}
          fillOpacity={0.75}
          rx={3}
        />
        {/* 阈值标记 0.3 和 0.6 */}
        <line x1={w * 0.3} y1={pad - 1} x2={w * 0.3} y2={h + pad + 1} stroke="#64748b" strokeWidth={0.6} />
        <line x1={w * 0.6} y1={pad - 1} x2={w * 0.6} y2={h + pad + 1} stroke="#64748b" strokeWidth={0.6} />
      </svg>
      <div className="text-[10px] text-neutral-500 leading-snug">{description}</div>
    </div>
  );
}

export default function MetaIgnorancePanel({ prompt, latestCode, refreshKey }: Props) {
  const [reading, setReading] = useState<MetaIgnoranceReading | null>(null);

  useEffect(() => {
    setReading(buildMetaIgnoranceReading(prompt, latestCode));
  }, [prompt, latestCode, refreshKey]);

  if (!reading) {
    return <div className="text-[11px] text-neutral-500">知不知门禁 · 正在读取…</div>;
  }

  // 状态颜色
  const statusColor =
    reading.status === "尚也"
      ? "#34d399"
      : reading.status === "平"
      ? "#fbbf24"
      : "#f87171";

  const statusBg =
    reading.status === "尚也"
      ? "bg-emerald-500/5 border-emerald-500/20"
      : reading.status === "平"
      ? "bg-amber-500/5 border-amber-500/20"
      : "bg-red-500/5 border-red-500/20";

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 顶部：状态 + 风险分数 */}
      <div className={`px-3 py-2 rounded-md border ${statusBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-wider text-neutral-400 font-semibold">
              知不知门禁 · meta-ignorance gate
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-semibold tracking-wider"
              style={{ color: statusColor }}
            >
              {reading.status}
            </span>
            <span className="text-[10px] text-neutral-500">·</span>
            <span className="text-[10px] text-neutral-400 tabular-nums">
              risk {(reading.risk * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* 风险主仪表 —— 更大 */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-neutral-300">自诱导幻觉风险</span>
            <span className="text-[10px] text-neutral-500">0.3 = 平 · 0.6 = 病也</span>
          </div>
          <svg width={520} height={14} viewBox="0 0 520 14" className="w-full">
            <defs>
              <linearGradient id="risk-grad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f87171" />
              </linearGradient>
            </defs>
            <rect x={0} y={2} width={520} height={10} fill="#1f2937" rx={4} />
            <rect
              x={0}
              y={2}
              width={Math.max(1, 520 * reading.risk)}
              height={10}
              fill="url(#risk-grad)"
              fillOpacity={0.7}
              rx={4}
            />
            <line x1={520 * 0.3} y1={0} x2={520 * 0.3} y2={14} stroke="#64748b" strokeWidth={0.8} />
            <line x1={520 * 0.6} y1={0} x2={520 * 0.6} y2={14} stroke="#64748b" strokeWidth={0.8} />
          </svg>
        </div>
      </div>

      {/* 三指标并列 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <Meter
            label="关系漂移"
            value={reading.relationEntropyDrift}
            color="#60a5fa"
            description="近期 engram 关系键相对历史均值的偏差"
          />
        </div>
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <Meter
            label="高不确定性下的过度自信"
            value={reading.overConfidenceUnderUncertainty}
            color="#a78bfa"
            description="信号分低 × self 描述使用确定性词汇"
          />
        </div>
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <Meter
            label="循环论证"
            value={reading.selfReferenceLoop}
            color="#fbbf24"
            description="最近 self 描述之间的语义重叠 + 窄化"
          />
        </div>
      </div>

      {/* 诊断 + 谦逊标记 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-3 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            诊断 · diagnosis
          </div>
          <ul className="flex flex-col gap-1">
            {reading.diagnosis.map((d, i) => (
              <li key={i} className="text-[11px] text-neutral-300 leading-snug flex gap-1.5 items-start">
                <span className="text-neutral-500 mt-1">·</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-2 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            谦逊标记建议 · humility tokens
          </div>
          {reading.humilityTokens.length === 0 ? (
            <div className="text-[11px] text-emerald-400/90">
              状态为「尚也」 — 无需插入谦逊标记
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {reading.humilityTokens.map((t, i) => (
                <div
                  key={i}
                  className="text-[10.5px] text-neutral-300 leading-snug italic"
                >
                  「{t}」
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部一句话 —— 直接来自老子 */}
      <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70 text-[11px] text-neutral-400 leading-relaxed">
        <span className="text-neutral-500">老子 · 七十一章 · </span>
        <span className="text-neutral-200">
          知不知，尚也；不知知，病也。是以圣人之不病，以其病病也，是以不病。
        </span>
        <span className="text-neutral-500 ml-2">· 把「病」本身当作「病」来检测，这就是解药。</span>
      </div>
    </div>
  );
}
