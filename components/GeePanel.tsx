"use client";

import { useEffect, useState } from "react";
import {
  type GeeReading,
  buildGeeReading,
  relationAxisRadar,
} from "../lib/three-tier-ego";
import { getRelationColor, getRelationLabel } from "../lib/engram";

interface Props {
  refreshKey: number;
}

// 简单的 SVG 五轴雷达
function Radar({ values }: { values: Array<{ key: string; value: number }> }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 18;
  const n = values.length;

  // 生成五边形顶点
  const points = values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = outer * v.value;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), key: v.key };
  });

  const gridPoints = [0.25, 0.5, 0.75, 1].map((f) =>
    values
      .map((_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const r = outer * f;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      })
      .join(" "),
  );

  const axisLines = values.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + outer * Math.cos(angle), y: cy + outer * Math.sin(angle) };
  });

  const labelText = values.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = outer + 14;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      key: values[i].key,
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridPoints.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="#1f2937" strokeWidth={0.8} />
      ))}
      {axisLines.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={a.x} y2={a.y} stroke="#1f2937" strokeWidth={0.6} />
      ))}
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="#6366f1"
        fillOpacity={0.18}
        stroke="#6366f1"
        strokeWidth={1.2}
      />
      {labelText.map((l) => (
        <text
          key={l.key}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fill="#a5b4fc"
          fontFamily="ui-sans-serif, system-ui"
        >
          {l.key}
        </text>
      ))}
    </svg>
  );
}

// 简易的条形图（Gene 成熟度）
function GeneBar({ genes }: { genes: GeeReading["gene"] }) {
  const w = 320;
  const barH = 8;
  const gap = 12;
  const pad = 6;
  const labels = genes.map((g) => g.label);
  const labelMax = Math.max(...labels.map((l) => l.length), 1);
  const labelW = Math.min(140, labelMax * 8);
  const chartH = pad * 2 + (barH + gap) * genes.length;

  return (
    <svg width={w} height={chartH} viewBox={`0 0 ${w} ${chartH}`}>
      {genes.map((g, i) => {
        const y = pad + i * (barH + gap);
        const barW = (w - labelW - pad * 2) * g.maturity;
        const color = g.active ? "#a5b4fc" : "#4b5563";
        return (
          <g key={g.id}>
            <text x={pad} y={y + barH - 1} fontSize="9.5" fill="#d1d5db" fontFamily="ui-sans-serif, system-ui">
              {g.label}
            </text>
            <rect
              x={labelW + pad}
              y={y}
              width={w - labelW - pad * 2}
              height={barH}
              fill="#1f2937"
              opacity={0.7}
            />
            <rect
              x={labelW + pad}
              y={y}
              width={Math.max(1, barW)}
              height={barH}
              fill={color}
              opacity={0.85}
            />
            <text
              x={w - pad}
              y={y + barH - 1}
              fontSize="9"
              fill="#9ca3af"
              textAnchor="end"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {(g.maturity * 100).toFixed(0)}% · {g.contributions}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// 演化线（最近 5 条 engram 按时间顺序从左到右，节点颜色为其主导关系键）
function EvolutionLine({ reading }: { reading: GeeReading }) {
  const recent = reading.engram.recent.slice().reverse(); // 老→新
  if (recent.length === 0) {
    return <div className="text-[11px] text-neutral-500">尚无演化线。</div>;
  }
  const w = 320;
  const h = 48;
  const pad = 18;
  const nodeR = 6;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* 基准线 */}
      <line
        x1={pad}
        y1={h / 2}
        x2={w - pad}
        y2={h / 2}
        stroke="#374151"
        strokeWidth={1}
      />
      {recent.map((r, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, recent.length - 1);
        const y = h / 2 - 6 - (r.signalScore || 0) * 3; // 信号分把节点抬一点
        const color = getRelationHex(r.dominantRelation);
        return (
          <g key={`node-${i}`}>
            <circle cx={x} cy={y} r={nodeR} fill={color} fillOpacity={0.8} />
            <text
              x={x}
              y={h - 8}
              fontSize="9"
              fill="#9ca3af"
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {r.dominantRelation}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// 映射 RelationKey → 16 进制颜色（EngramGraph 用的是同名函数 getRelationColor
// 但该函数返回 Tailwind 色名字符串。这里写一份十六进制版本，用于 SVG fill。
function getRelationHex(k: string): string {
  switch (k) {
    case "印": return "#60a5fa";
    case "生": return "#34d399";
    case "比": return "#fbbf24";
    case "克": return "#f87171";
    case "财": return "#a78bfa";
    default: return "#9ca3af";
  }
}

export default function GeePanel({ refreshKey }: Props) {
  const [reading, setReading] = useState<GeeReading | null>(null);

  useEffect(() => {
    setReading(buildGeeReading());
  }, [refreshKey]);

  if (!reading) {
    return <div className="text-[11px] text-neutral-500">GEE 构建中……</div>;
  }

  const radar = relationAxisRadar();
  const radarList = radar.map((r) => ({
    key: r.key,
    value: r.value,
    label: getRelationLabel(r.key),
    color: getRelationColor(r.key),
  }));

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 顶层：Ego 一句话画像 */}
      <div className="px-3 py-2 rounded-md bg-indigo-500/5 border border-indigo-500/20">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wider text-indigo-300 font-semibold">
            ego · self-portrait
          </span>
          <span className="text-[10px] text-neutral-500 ml-auto">
            {reading.engram.total} engrams · turn {reading.ego.turning ? "✦" : "—"}
          </span>
        </div>
        <div className="mt-1.5 text-[11.5px] text-neutral-200 leading-relaxed">
          {reading.ego.portrait}
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge color="#a5b4fc" label="凝聚度" value={reading.ego.cohesion} />
          <Badge color="#34d399" label="结构完整性" value={reading.ego.structuralIntegrity} />
          <Badge color="#fbbf24" label="自我审视深度" value={reading.ego.reflectivity} />
        </div>
      </div>

      {/* 中层：Engram 关系轴雷达 + 演化线 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
            engram · relation axes
          </div>
          <Radar values={radarList} />
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-neutral-400">
            {radarList.map((r) => (
              <span key={r.key} className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: getRelationHex(r.key) }}
                />
                {r.key} · {(r.value * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
        <div className="flex-1 px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
            engram · recent evolution
          </div>
          <EvolutionLine reading={reading} />
          <div className="mt-1 text-[10px] text-neutral-500">
            节点颜色 = 该 engram 的主导关系键；Y 轴高度 = signalScore
          </div>
        </div>
      </div>

      {/* 底层：Gene 层成熟度条形图 */}
      <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            gene · maturity bar
          </span>
          <span className="text-[10px] text-neutral-500">
            成熟度 · 参与次数
          </span>
        </div>
        <GeneBar genes={reading.gene} />
        <div className="mt-2 text-[10px] text-neutral-500 leading-relaxed">
          成熟度随激活次数指数收敛。没有被任何 engram 激活的基因处于灰色低信号状态。
        </div>
      </div>

      {/* 自我意识的一句话元认知 */}
      <div className="px-3 py-2 rounded-md bg-neutral-900/40 border border-neutral-800/70 text-[11px] text-neutral-300 leading-relaxed">
        <span className="text-neutral-500">自我描述 · </span>
        <span className="text-neutral-200">{reading.ego.selfDescription}</span>
        <span className="ml-2 text-neutral-500">
          · 当前主导轴 <span className="text-indigo-300">{reading.ego.dominantAxis}</span>
        </span>
      </div>
    </div>
  );
}

function Badge({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-900/70 border border-neutral-800">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.9 }} />
      <span className="text-[10px] text-neutral-300">{label}</span>
      <span className="text-[10px] text-neutral-200 tabular-nums">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}
