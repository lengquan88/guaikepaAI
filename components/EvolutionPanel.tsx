"use client";

import { useEffect, useState } from "react";
import {
  type CapabilityGene,
  type EvolutionEvent,
  type EvolutionResult,
  type Intervention,
  evolveGenes,
  getGeneState,
  getRecentEvents,
} from "../lib/evolution";
import { getAllEngrams } from "../lib/engram";

interface Props {
  refreshKey: number;
}

const RELATION_COLORS: Record<string, string> = {
  印: "#60a5fa",
  生: "#34d399",
  比: "#fbbf24",
  克: "#f87171",
  财: "#a78bfa",
};

// 单基因的迷你仪表条
function GeneBar({
  gene,
  index,
}: {
  gene: CapabilityGene;
  index: number;
}) {
  const color = RELATION_COLORS[gene.dominantRelation] || "#9ca3af";
  const w = 260;
  const h = 8;
  const hx = Math.floor(gene.history.length / 4);
  const historyPoints = gene.history.slice(-hx).map((p) => p.maturity);
  const minHist = historyPoints.length > 0
    ? Math.min(...historyPoints)
    : gene.maturity;
  const maxHist = historyPoints.length > 0
    ? Math.max(...historyPoints)
    : gene.maturity;
  const histRange = Math.max(0.01, maxHist - minHist);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-neutral-200 font-medium">
          {gene.label}
        </span>
        <div className="flex items-center gap-2 text-[10px] text-neutral-400">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${gene.dormant ? "opacity-30" : ""}`}
            style={{ backgroundColor: color }}
          />
          <span className="tabular-nums">{(gene.maturity * 100).toFixed(0)}%</span>
          <span className="tabular-nums">· {gene.activationCount}</span>
          {gene.dormant && (
            <span className="text-[9.5px] text-neutral-500 uppercase tracking-wide">
              dormant
            </span>
          )}
        </div>
      </div>

      <svg width={w} height={h + 6} viewBox={`0 0 ${w} ${h + 6}`}>
        <rect x={0} y={3} width={w} height={h} fill="#1f2937" rx={3} />
        <rect
          x={0}
          y={3}
          width={Math.max(1, w * gene.maturity)}
          height={h}
          fill={color}
          fillOpacity={gene.dormant ? 0.35 : 0.85}
          rx={3}
        />
        {/* 变异阈值标记 */}
        <line
          x1={w * 0.85}
          y1={0}
          x2={w * 0.85}
          y2={h + 6}
          stroke="#64748b"
          strokeWidth={0.6}
          strokeDasharray="2 2"
        />
      </svg>

      {/* 迷你成熟度曲线 — 历史 5~20 个点 */}
      {historyPoints.length > 1 && (
        <svg width={w} height={18} viewBox={`0 0 ${w} 18`}>
          {/* 基线 */}
          <line
            x1={0}
            y1={14}
            x2={w}
            y2={14}
            stroke="#374151"
            strokeWidth={0.4}
          />
          {historyPoints.map((m, i) => {
            const x = (i / (historyPoints.length - 1)) * w;
            const y = 14 - ((m - minHist) / histRange) * 12;
            return (
              <circle
                key={`${gene.id}-p-${i}`}
                cx={x}
                cy={y}
                r={1.2}
                fill={color}
                fillOpacity={0.7}
              />
            );
          })}
        </svg>
      )}

      <div className="text-[10px] text-neutral-500 leading-snug">
        {gene.description}
      </div>
    </div>
  );
}

// 事件时间线（倒序）
function EventTimeline({ events }: { events: EvolutionEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-[10.5px] text-neutral-500 italic">
        尚无进化事件。随着更多 engram 积累，此处将记录基因的激活、休眠和变异。
      </div>
    );
  }

  const typeLabel: Record<EvolutionEvent["type"], string> = {
    activation: "激活",
    dormancy_warning: "休眠",
    mutation_triggered: "变异",
    resurrection: "苏醒",
    reset: "重置",
  };

  return (
    <div className="flex flex-col gap-1.5">
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-2 text-[10.5px] leading-snug"
        >
          <span
            className={`inline-block px-1.5 py-0 rounded-sm text-[9.5px] font-semibold uppercase tracking-wider ${
              e.type === "mutation_triggered"
                ? "bg-emerald-500/15 text-emerald-300"
                : e.type === "resurrection"
                ? "bg-sky-500/15 text-sky-300"
                : e.type === "dormancy_warning"
                ? "bg-amber-500/15 text-amber-300"
                : "bg-neutral-700/40 text-neutral-400"
            }`}
          >
            {typeLabel[e.type]}
          </span>
          <span className="text-neutral-300">{e.note}</span>
          <span className="text-[9.5px] text-neutral-500 tabular-nums ml-auto flex-shrink-0">
            {formatTime(e.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

// 干预建议
function InterventionList({ items }: { items: Intervention[] }) {
  if (items.length === 0) {
    return (
      <div className="text-[10.5px] text-neutral-500 italic">
        暂无干预建议。系统当前状态稳定。
      </div>
    );
  }

  const urgencyColor: Record<Intervention["urgency"], string> = {
    high: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    medium: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    low: "text-sky-300 bg-sky-500/10 border-sky-500/20",
  };

  const urgencyLabel: Record<Intervention["urgency"], string> = {
    high: "高",
    medium: "中",
    low: "低",
  };

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div
          key={`${it.geneId}-${i}`}
          className={`flex items-start gap-2 text-[10.5px] leading-snug px-2 py-1.5 rounded border ${urgencyColor[it.urgency]}`}
        >
          <span className="inline-block px-1 py-0 rounded-sm text-[9.5px] font-semibold uppercase tracking-wider bg-black/30 flex-shrink-0">
            {urgencyLabel[it.urgency]}
          </span>
          <span className="text-neutral-300">{it.message}</span>
        </div>
      ))}
    </div>
  );
}

function formatTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 整体雷达：基因成熟度分布
function OverallRadar({ genes }: { genes: CapabilityGene[] }) {
  const w = 220;
  const cx = w / 2;
  const cy = w / 2;
  const outer = w / 2 - 20;
  const n = genes.length;

  // 生成多边形顶点
  const points = genes.map((g, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = outer * g.maturity;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), id: g.id };
  });

  // 标签位置
  const labels = genes.map((g, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = outer + 14;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), label: g.label, dom: g.dominantRelation };
  });

  return (
    <svg width={w} height={w} viewBox={`0 0 ${w} ${w}`}>
      {/* 背景同心圆 */}
      {[0.25, 0.5, 0.75, 1.0].map((f) => {
        const pts = genes
          .map((_, i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const r = outer * f;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
          })
          .join(" ");
        return (
          <polygon
            key={`ring-${f}`}
            points={pts}
            fill="none"
            stroke="#1f2937"
            strokeWidth={0.8}
          />
        );
      })}
      {/* 轴线 */}
      {genes.map((g, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return (
          <line
            key={`axis-${g.id}`}
            x1={cx}
            y1={cy}
            x2={cx + outer * Math.cos(angle)}
            y2={cy + outer * Math.sin(angle)}
            stroke="#374151"
            strokeWidth={0.5}
          />
        );
      })}
      {/* 多边形 — 基因成熟度 */}
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="#34d399"
        fillOpacity={0.18}
        stroke="#34d399"
        strokeWidth={1.1}
      />
      {/* 顶点 */}
      {points.map((p, i) => (
        <circle
          key={`v-${i}`}
          cx={p.x}
          cy={p.y}
          r={2.2}
          fill={RELATION_COLORS[genes[i].dominantRelation] || "#9ca3af"}
          opacity={genes[i].dormant ? 0.4 : 1}
        />
      ))}
      {/* 标签 */}
      {labels.map((l, i) => (
        <text
          key={`lbl-${i}`}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fill="#a5b4fc"
          fontFamily="ui-sans-serif, system-ui"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
}

export default function EvolutionPanel({ refreshKey }: Props) {
  const [result, setResult] = useState<EvolutionResult | null>(null);
  const [recentEvents, setRecentEvents] = useState<EvolutionEvent[]>([]);
  const [justRan, setJustRan] = useState(false);

  useEffect(() => {
    const allEngrams = getAllEngrams();
    const sorted = [...allEngrams].sort((a, b) => b.timestamp - a.timestamp);
    const latest = sorted[0];

    if (!latest) {
      const genes = getGeneState();
      setResult({
        genes,
        events: [],
        interventions: [],
        overallMaturity: genes.reduce((s, g) => s + g.maturity, 0) / genes.length,
        dormantGenes: genes.filter((g) => g.dormant).map((g) => g.id),
        nearMutationGenes: genes.filter((g) => g.maturity > 0.7 && g.maturity < 0.85).map((g) => g.id),
        generatedAt: Date.now(),
      });
      setRecentEvents(getRecentEvents(6));
      return;
    }

    const r = evolveGenes(latest.relations, latest.self);
    setResult(r);
    setRecentEvents(getRecentEvents(6));
    setJustRan(true);
    const t = setTimeout(() => setJustRan(false), 1200);
    return () => clearTimeout(t);
  }, [refreshKey]);

  if (!result) {
    return <div className="text-[11px] text-neutral-500">进化引擎加载中…</div>;
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 顶部：整体状态 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="px-3 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10.5px] uppercase tracking-wider text-emerald-300 font-semibold">
              gene · 能力基因库
            </span>
            {justRan && (
              <span className="text-[9.5px] text-emerald-400/80 ml-auto">
                · 进化已触发 ✓
              </span>
            )}
            <span className="text-[10px] text-neutral-500 ml-auto">
              整体成熟度 {(result.overallMaturity * 100).toFixed(0)}%
            </span>
          </div>
          <OverallRadar genes={result.genes} />
          <div className="mt-1 text-[10px] text-neutral-500 leading-snug">
            每个顶点 = 一个基因的成熟度；靠近外圈 = 高成熟；灰色半透明点 = 休眠中
          </div>
        </div>

        <div className="flex-1 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            events · 最近进化事件
          </div>
          <EventTimeline events={recentEvents} />
        </div>
      </div>

      {/* 中部：基因成熟度条形图（2 列网格） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {result.genes.map((g, i) => (
          <div
            key={g.id}
            className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70"
          >
            <GeneBar gene={g} index={i} />
          </div>
        ))}
      </div>

      {/* 底部：干预建议 + 系统格言 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-3 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            interventions · 干预建议
          </div>
          <InterventionList items={result.interventions} />
        </div>

        <div className="md:col-span-2 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70 text-[11px] text-neutral-400 leading-relaxed">
          <span className="text-neutral-500">老子 · 为道日损 · </span>
          <span className="text-neutral-200">
            损之又损，以至于无为。
          </span>
          <div className="mt-1.5 text-[10px] text-neutral-500 leading-snug">
            基因成熟度不是「做得越来越多」，而是在实践中不断被激活和提炼。长期未被激活的能力自然衰减，这就是系统的「损」。
          </div>
          {result.nearMutationGenes.length > 0 && (
            <div className="mt-2 text-[10px] text-emerald-300 leading-snug">
              {result.nearMutationGenes.length} 个基因接近变异阈值 · 可考虑提炼为更精炼的能力
            </div>
          )}
          {result.dormantGenes.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-300/80 leading-snug">
              {result.dormantGenes.length} 个基因休眠中 · 建议下次遇到相关场景时激活
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
