"use client";

import {
  HarnessRoute,
  MemoryStreamEntry,
  RelationKey,
  RelationProfile,
  dominantRelation,
  getHarnessRoutes,
  getRelationHex,
  getRelationKeys,
  memoryStream,
  relationProfile,
} from "@/lib/engram";
import { SparklesIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

interface MagneticFieldProps {
  prompt: string;
}

// 五边形/五轴雷达图 —— 展示当前 prompt 的关系强度剖面
function RelationRadar({ profile }: { profile: RelationProfile[] }) {
  const size = 180;
  const center = size / 2;
  const maxRadius = size / 2 - 28;
  const keys = getRelationKeys();

  // 五边形顶点角度（从顶端开始，顺时针）
  const angleFor = (i: number) => (Math.PI * 2 * i) / 5 - Math.PI / 2;

  // 背景网格（4 圈同心五边形）
  const gridPolygons = [0.25, 0.5, 0.75, 1.0].map((frac) =>
    keys
      .map((_, i) => {
        const r = maxRadius * frac;
        const x = center + r * Math.cos(angleFor(i));
        const y = center + r * Math.sin(angleFor(i));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" "),
  );

  // 顶点标签位置（外扩一点）
  const labelPositions = keys.map((k, i) => {
    const r = maxRadius + 16;
    return {
      key: k,
      x: center + r * Math.cos(angleFor(i)),
      y: center + r * Math.sin(angleFor(i)),
    };
  });

  // 实际数据的五边形（fill shape）
  const dataPoints = keys.map((k, i) => {
    const entry = profile.find((p) => p.key === k);
    const pct = entry ? entry.percentage / 100 : 0;
    // 给最小值保底（避免零值图形塌缩）
    const r = maxRadius * Math.max(0.08, pct);
    return {
      key: k,
      x: center + r * Math.cos(angleFor(i)),
      y: center + r * Math.sin(angleFor(i)),
      pct: entry ? entry.percentage : 0,
    };
  });

  const fillPath = dataPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ") + " Z";

  // 每个关系键的颜色——绘制一个独立的"发光点"
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>

        {/* 背景发光 */}
        <circle cx={center} cy={center} r={maxRadius} fill="url(#radarGlow)" />

        {/* 同心五边形网格 */}
        {gridPolygons.map((pts, i) => (
          <polygon
            key={`grid-${i}`}
            points={pts}
            fill="none"
            stroke="#2a2a3a"
            strokeWidth="1"
          />
        ))}

        {/* 从中心到顶点的辐射线 */}
        {labelPositions.map((lp, i) => {
          const inner = {
            x: center + 8 * Math.cos(angleFor(i)),
            y: center + 8 * Math.sin(angleFor(i)),
          };
          return (
            <line
              key={`axis-${i}`}
              x1={inner.x}
              y1={inner.y}
              x2={center + maxRadius * Math.cos(angleFor(i))}
              y2={center + maxRadius * Math.sin(angleFor(i))}
              stroke="#2a2a3a"
              strokeWidth="1"
            />
          );
        })}

        {/* 数据填充 */}
        <path d={fillPath} fill="url(#radarStroke)" fillOpacity="0.28" stroke="url(#radarStroke)" strokeWidth="1.5" />

        {/* 数据点（每个关系键一个带色圆圈） */}
        {dataPoints.map((p) => (
          <g key={`dot-${p.key}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={5}
              fill={getRelationHex(p.key)}
              fillOpacity="0.95"
              stroke={getRelationHex(p.key)}
              strokeWidth="1.5"
            />
            <circle cx={p.x} cy={p.y} r={10} fill={getRelationHex(p.key)} fillOpacity="0.15" />
          </g>
        ))}

        {/* 关系键标签 */}
        {labelPositions.map((lp) => (
          <text
            key={`label-${lp.key}`}
            x={lp.x}
            y={lp.y}
            fill={getRelationHex(lp.key)}
            fontSize="13"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {lp.key}
          </text>
        ))}
      </svg>

      {/* 底部小条形图：显示精确的百分比 */}
      <div className="w-full mt-3 space-y-1.5">
        {dataPoints.map((p) => (
          <div key={`bar-${p.key}`} className="flex items-center gap-2">
            <span
              className="w-4 text-[10px] text-right"
              style={{ color: getRelationHex(p.key) }}
            >
              {p.key}
            </span>
            <div className="flex-1 h-1.5 bg-neutral-800/60 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(5, p.pct)}%`,
                  backgroundColor: getRelationHex(p.key),
                  opacity: 0.85,
                }}
              />
            </div>
            <span className="w-8 text-right text-[10px] text-neutral-500 tabular-nums">
              {p.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 记忆流时间线：水平堆叠条 —— 每个 engram 的关系分布
function MemoryStream({ stream }: { stream: MemoryStreamEntry[] }) {
  const keys = getRelationKeys();
  if (stream.length === 0) {
    return (
      <div className="text-[10px] text-neutral-600 italic">
        No engrams stored yet — the memory field is empty.
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      {stream.map((entry) => (
        <div key={`ms-${entry.index}-${entry.timestamp}`} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-500 truncate">
              {entry.index === 0 ? "latest · " : ""}{entry.self}
            </span>
            <span className="text-[9px] text-neutral-600">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-sm w-full">
            {keys.map((k) => {
              const pct = entry.distribution[k] || 0;
              if (pct === 0) return null;
              return (
                <div
                  key={`ms-${entry.index}-${k}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: getRelationHex(k),
                    opacity: 0.75,
                  }}
                  title={`${k}: ${pct}%`}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 pt-2 mt-1 border-t border-neutral-800/50">
        {keys.map((k) => (
          <div key={`legend-${k}`} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: getRelationHex(k) }}
            />
            <span className="text-[9px] text-neutral-500">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Harness 路由指示器 —— 显示当前 prompt 走到了哪条认知路由
function HarnessBadge({ route }: { route: HarnessRoute }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-2.5 h-2.5 rounded-full animate-pulse"
        style={{ backgroundColor: getRelationHex(route.key) }}
      />
      <span className="text-[11px] text-neutral-400">{route.label}</span>
    </div>
  );
}

export default function MagneticField({ prompt }: MagneticFieldProps) {
  const [profile, setProfile] = useState<RelationProfile[]>([]);
  const [stream, setStream] = useState<MemoryStreamEntry[]>([]);
  const [route, setRoute] = useState<HarnessRoute | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  // 当 prompt 或 engram 存储变化时重新计算
  useEffect(() => {
    if (!isMounted) return;
    const p = relationProfile(prompt);
    setProfile(p);
    setStream(memoryStream(6));
    const hr = getHarnessRoutes().find((r) => r.key === dominantRelation(prompt));
    setRoute(hr || null);
  }, [isMounted, prompt]);

  if (!isMounted) return null;

  return (
    <div className="px-4 py-3 border-t border-neutral-800/40 bg-neutral-950/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[11px] font-medium text-neutral-400">
            Magnetic Field — 内磁场
          </span>
        </div>
        {route && <HarnessBadge route={route} />}
      </div>

      {/* 上半：当前 prompt 的关系强度雷达 */}
      <div className="flex justify-center py-2">
        {profile.length > 0 ? (
          <RelationRadar profile={profile} />
        ) : (
          <div className="text-[10px] text-neutral-600 italic py-6">
            Awaiting input — no activation signal yet.
          </div>
        )}
      </div>

      {/* 下半：记忆流时间线（外磁场） */}
      <div className="mt-3 pt-3 border-t border-neutral-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
            Memory Stream — 外磁场·时间流
          </span>
          <span className="text-[9px] text-neutral-600">
            stacked relation distribution · latest ← older
          </span>
        </div>
        <MemoryStream stream={stream} />
      </div>
    </div>
  );
}
