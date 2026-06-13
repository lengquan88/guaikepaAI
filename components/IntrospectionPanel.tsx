"use client";

import { useEffect, useState } from "react";
import {
  type IntrospectionReading,
  type LookBackResult,
  type PatternMatch,
  type SystemHealthStatus,
  type TrendReading,
  computeTrend,
  getIntrospectionHistory,
  getLookBackCount,
  introspect,
  loadLastReading,
  lookBack,
} from "../lib/introspection";

interface Props {
  prompt: string;
  latestCode: string;
  refreshKey: number;
}

const STATUS_META: Record<
  SystemHealthStatus,
  { bg: string; border: string; text: string; dot: string }
> = {
  康: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  平: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    text: "text-sky-300",
    dot: "bg-sky-400",
  },
  损: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  病: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-300",
    dot: "bg-red-400",
  },
};

// 状态仪表
function StatusHeader({ reading }: { reading: IntrospectionReading }) {
  const status = reading.overall.status;
  const meta = STATUS_META[status];

  return (
    <div
      className={`px-3 py-2 rounded-md ${meta.bg} border ${meta.border} flex flex-col gap-2`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${meta.dot} ${status === "康" || status === "平" ? "" : "animate-pulse"}`}
          />
          <span className={`text-[11px] font-semibold ${meta.text}`}>
            内省仪表板 · 系统状态「{status}」
          </span>
        </div>
        <span className="text-[10px] text-neutral-500">
          {reading.engramCount} engrams · {reading.genes.length} genes · {reading.sixGates.openedCount}/6 gates
        </span>
      </div>

      {/* 综合读数条 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] text-neutral-500 uppercase tracking-wider">
            风险
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-neutral-800 rounded">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.round(reading.overall.risk * 100)}%`,
                  background: `linear-gradient(to right, #34d399, #fbbf24, #f87171)`,
                }}
              />
            </div>
            <span className="text-[10px] text-neutral-300 tabular-nums">
              {(reading.overall.risk * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] text-neutral-500 uppercase tracking-wider">
            一致性
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-neutral-800 rounded">
              <div
                className="h-full rounded bg-emerald-500/70"
                style={{ width: `${Math.round(reading.overall.coherence * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-300 tabular-nums">
              {(reading.overall.coherence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] text-neutral-500 uppercase tracking-wider">
            ego 凝聚
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-neutral-800 rounded">
              <div
                className="h-full rounded bg-indigo-500/70"
                style={{ width: `${Math.round(reading.gee.ego.cohesion * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-300 tabular-nums">
              {(reading.gee.ego.cohesion * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] text-neutral-500 uppercase tracking-wider">
            ego 审视
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-neutral-800 rounded">
              <div
                className="h-full rounded bg-purple-500/70"
                style={{ width: `${Math.round(reading.gee.ego.reflectivity * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-300 tabular-nums">
              {(reading.gee.ego.reflectivity * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* 一句话自我描述 */}
      <div className="mt-1 text-[10.5px] text-neutral-400 italic leading-snug">
        「 {reading.summaryLine} 」
      </div>
    </div>
  );
}

// 跨模块模式卡
function PatternCard({ pattern }: { pattern: PatternMatch }) {
  const severity = pattern.severity;
  // severity < 0.3 = 正模式 (健康进展)，>= 0.3 = 需要关注
  const isPositive = severity < 0.3;
  const meta = isPositive
    ? { bg: "bg-emerald-500/5", border: "border-emerald-500/25", text: "text-emerald-300" }
    : severity >= 0.7
    ? { bg: "bg-red-500/5", border: "border-red-500/25", text: "text-red-300" }
    : severity >= 0.5
    ? { bg: "bg-amber-500/5", border: "border-amber-500/25", text: "text-amber-300" }
    : { bg: "bg-sky-500/5", border: "border-sky-500/25", text: "text-sky-300" };

  return (
    <div className={`px-3 py-2 rounded-md ${meta.bg} border ${meta.border} flex flex-col gap-1.5`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold ${meta.text}`}>
          ◉ {pattern.name}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-12 h-1 bg-neutral-800 rounded">
            <div
              className="h-full rounded"
              style={{
                width: `${Math.round(severity * 100)}%`,
                background: isPositive ? "#34d399" : severity >= 0.7 ? "#f87171" : "#fbbf24",
              }}
            />
          </div>
          <span className="text-[9.5px] text-neutral-500 tabular-nums">
            {(severity * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* 证据 */}
      <div className="flex flex-col gap-0.5 pl-2">
        {pattern.evidence.map((e, i) => (
          <div key={i} className="text-[10px] text-neutral-400 leading-snug">
            · {e}
          </div>
        ))}
      </div>

      {/* 建议 */}
      <div className="text-[10px] text-neutral-500 leading-snug pl-2 pt-1 border-t border-neutral-800/50">
        {pattern.recommendation}
      </div>
    </div>
  );
}

// 六论门禁迷你条
function SixGatesMinibar({ reading }: { reading: IntrospectionReading }) {
  const gates = [
    { id: "ontos", name: "本体论", gate: reading.sixGates.ontos },
    { id: "cognitio", name: "认识论", gate: reading.sixGates.cognitio },
    { id: "praxis", name: "实践论", gate: reading.sixGates.praxis },
    { id: "skene", name: "境界论", gate: reading.sixGates.skene },
    { id: "horizon", name: "未来观论", gate: reading.sixGates.horizon },
    { id: "reflectio", name: "元认知论", gate: reading.sixGates.reflectio },
  ];

  const statusColor: Record<string, string> = {
    open: "#34d399",
    lingering: "#fbbf24",
    shut: "#64748b",
  };

  return (
    <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
        六论门禁 · six gates
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {gates.map((g) => (
          <div key={g.id} className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusColor[g.gate.status] }}
              />
              <span className="text-[10px] text-neutral-300">{g.name}</span>
            </div>
            <div className="w-full h-1 bg-neutral-800 rounded">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.round(g.gate.score * 100)}%`,
                  backgroundColor: statusColor[g.gate.status],
                  opacity: 0.8,
                }}
              />
            </div>
            <span className="text-[9px] text-neutral-500 tabular-nums">
              {g.gate.status} {(g.gate.score * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 修身/基因迷你摘要
function CultivationMinibar({ reading }: { reading: IntrospectionReading }) {
  const openGates = reading.cultivation.gates.filter((g) => g.status === "open").length;
  return (
    <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          修身 · self-cultivation
        </span>
        <span className="text-[10px] text-neutral-400 tabular-nums">
          {openGates}/{reading.cultivation.gates.length} gates open
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {reading.cultivation.gates.map((g) => (
          <div key={g.id} className="flex items-center gap-2 text-[10px]">
            <span
              className={`inline-block w-1 h-1 rounded-full ${
                g.status === "open" ? "bg-emerald-400" : g.status === "lingering" ? "bg-amber-400" : "bg-neutral-600"
              }`}
            />
            <span className="text-neutral-300">{g.name}</span>
            <span className="text-neutral-500 tabular-nums ml-auto">
              {(g.score * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 迷你趋势图 · 用三条 SVG 折线叠加展示 risk / coherence / ego-reflectivity
// ----------------------------------------------------------------------

function MiniTrendChart({
  riskPoints,
  coherencePoints,
  egoPoints,
}: {
  riskPoints: { t: number; value: number }[];
  coherencePoints: { t: number; value: number }[];
  egoPoints: { t: number; value: number }[];
}) {
  const w = 760;
  const h = 110;
  const padX = 10;
  const padY = 10;

  const makePath = (pts: { t: number; value: number }[]): string => {
    if (pts.length === 0) return "";
    const n = pts.length;
    return pts
      .map((p, i) => {
        const x = padX + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * padX));
        const y = h - padY - Math.max(0, Math.min(1, p.value)) * (h - 2 * padY);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const makeDots = (pts: { t: number; value: number }[], color: string): string => {
    const n = pts.length;
    return pts
      .map((p, i) => {
        const x = padX + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * padX));
        const y = h - padY - Math.max(0, Math.min(1, p.value)) * (h - 2 * padY);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${color}" />`;
      })
      .join("");
  };

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height: 110 }}
      >
        <line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke="#27272a" strokeWidth={0.6} strokeDasharray="2 3" />
        <line
          x1={padX}
          y1={(h - 2 * padY) / 2 + padY}
          x2={w - padX}
          y2={(h - 2 * padY) / 2 + padY}
          stroke="#27272a"
          strokeWidth={0.6}
          strokeDasharray="2 3"
        />
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#27272a" strokeWidth={0.6} strokeDasharray="2 3" />

        {/* 0.5 风险阈值线 */}
        <line
          x1={padX}
          y1={h - padY - 0.5 * (h - 2 * padY)}
          x2={w - padX}
          y2={h - padY - 0.5 * (h - 2 * padY)}
          stroke="#f87171"
          strokeWidth={0.6}
          strokeDasharray="4 3"
          opacity="0.5"
        />

        <path d={makePath(riskPoints)} stroke="#f87171" strokeWidth={1.4} fill="none" opacity="0.9" />
        <g dangerouslySetInnerHTML={{ __html: makeDots(riskPoints, "#f87171") }} />

        <path d={makePath(coherencePoints)} stroke="#34d399" strokeWidth={1.4} fill="none" opacity="0.75" />
        <g dangerouslySetInnerHTML={{ __html: makeDots(coherencePoints, "#34d399") }} />

        <path d={makePath(egoPoints)} stroke="#a78bfa" strokeWidth={1.4} fill="none" opacity="0.75" />
        <g dangerouslySetInnerHTML={{ __html: makeDots(egoPoints, "#a78bfa") }} />
      </svg>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
          risk · 综合风险
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          coherence · 跨门禁一致性
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
          ego · 自我审视深度
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0 border-t border-dashed border-red-400/60" />
          0.5 风险阈值
        </div>
      </div>
    </div>
  );
}

export default function IntrospectionPanel({ prompt, latestCode, refreshKey }: Props) {
  const [reading, setReading] = useState<IntrospectionReading | null>(null);
  const [trend, setTrend] = useState<TrendReading | null>(null);
  const [lookBackResult, setLookBackResult] = useState<LookBackResult | null>(null);
  const [lookBackCount, setLookBackCount] = useState(0);
  const [justLookedBack, setJustLookedBack] = useState(false);

  useEffect(() => {
    const cached = loadLastReading();
    if (cached) setReading(cached);
    setTrend(computeTrend(getIntrospectionHistory()));
    setLookBackCount(getLookBackCount());

    const timer = setTimeout(() => {
      const r = introspect(prompt, latestCode);
      setReading(r);
      setTrend(computeTrend(getIntrospectionHistory()));
    }, 80);
    return () => clearTimeout(timer);
  }, [refreshKey, prompt, latestCode]);

  const handleLookBack = () => {
    const result = lookBack(prompt, latestCode);
    setLookBackResult(result);
    setLookBackCount(result.lookBackTotal);
    // 重新读取 — 把最新生成的 introspect 读出来
    const r = loadLastReading();
    if (r) setReading(r);
    setTrend(computeTrend(getIntrospectionHistory()));
    setJustLookedBack(true);
    const t = setTimeout(() => setJustLookedBack(false), 1500);
    return () => clearTimeout(t);
  };

  if (!reading) {
    return (
      <div className="text-[11px] text-neutral-500 italic px-4 py-3">
        正在进行系统自画像…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* 头部：综合状态 */}
      <StatusHeader reading={reading} />

      {/* 操作区：回头看按钮 + 审阅计数 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLookBack}
            className={`px-3 py-1.5 rounded text-[11px] font-medium border transition-all ${
              justLookedBack
                ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
                : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
            }`}
          >
            ◉ 回头看 · look back
          </button>
          <span className="text-[10px] text-neutral-500">
            累计审阅 {lookBackCount} 次
          </span>
        </div>
        <span className="text-[10px] text-neutral-500 italic">
          知止不殆 — 人工触发一次内省审阅并标记最新 engram 为 retro
        </span>
      </div>

      {/* 回头看结果提示 */}
      {lookBackResult && (
        <div className="px-3 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-200 leading-relaxed">
          {lookBackResult.note}
          {lookBackResult.reviewedEngramId && (
            <span className="text-[10px] text-emerald-400/70 ml-2">
              · 最新 engram 已标记 retro
            </span>
          )}
        </div>
      )}

      {/* 迷你趋势图（如果有历史数据） */}
      {trend && trend.risk.length >= 2 && (
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              时间序列 · trend ({trend.risk.length} 个样本)
            </span>
            <span className="text-[10px] text-neutral-500">
              累计识别 {trend.patterns} 种模式
            </span>
          </div>
          <MiniTrendChart
            riskPoints={trend.risk}
            coherencePoints={trend.coherence}
            egoPoints={trend.egoReflectivity}
          />
        </div>
      )}

      {/* 六论迷你条 */}
      <SixGatesMinibar reading={reading} />

      {/* 修身迷你条 */}
      <CultivationMinibar reading={reading} />

      {/* 模式检测区 */}
      {reading.patterns.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 px-1">
            跨模块模式 · patterns ({reading.patterns.length})
          </div>
          {reading.patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70 text-[10.5px] text-neutral-500 italic">
          未检测到跨模块关联模式。系统状态稳定。
        </div>
      )}

      {/* 进化事件摘要 */}
      {reading.recentEvents.length > 0 && (
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            进化事件摘要 · evolution events ({reading.recentEvents.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reading.recentEvents.slice(0, 8).map((e) => {
              const colorMap: Record<string, string> = {
                mutation_triggered: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                resurrection: "bg-sky-500/15 text-sky-300 border-sky-500/30",
                dormancy_warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                activation: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
              };
              const labelMap: Record<string, string> = {
                mutation_triggered: "变异",
                resurrection: "苏醒",
                dormancy_warning: "休眠",
                activation: "激活",
                reset: "重置",
              };
              return (
                <span
                  key={e.id}
                  className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] border ${colorMap[e.type] ?? "bg-neutral-800 text-neutral-400 border-neutral-700"}`}
                >
                  {labelMap[e.type] ?? e.type}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 建议 */}
      {reading.topRecommendations.length > 0 && (
        <div className="px-3 py-2 rounded-md bg-indigo-500/5 border border-indigo-500/20">
          <div className="text-[10px] uppercase tracking-wider text-indigo-300 mb-1.5 font-semibold">
            系统建议 · recommendations
          </div>
          <div className="flex flex-col gap-1">
            {reading.topRecommendations.map((rec, i) => (
              <div key={i} className="text-[10.5px] text-neutral-400 leading-snug pl-2">
                · {rec}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
