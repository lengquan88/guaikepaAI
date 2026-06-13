"use client";

import {
  EngramGraph as EngramGraphData,
  GraphNode,
  RelationKey,
  computeEngramGraph,
  getRelationHex,
  getRelationLabel,
} from "@/lib/engram";
import { useEffect, useState } from "react";

interface EngramGraphProps {
  // 强制刷新时递增值
  refreshKey?: number;
}

// 跨 engram 传播图：
//  - 外层 SVG：520 × 340（归一化坐标 × 实际尺寸）
//  - 节点颜色：按 dominantRelation 着色
//  - 节点大小：与 signalScore + 关系总数正相关
//  - 边：仅显示 top-N 相似度高的连接，颜色越深 = 相似度越高
//  - 点击节点：显示 self、dominant relation、signal score
export default function EngramGraph({ refreshKey = 0 }: EngramGraphProps) {
  const [graph, setGraph] = useState<EngramGraphData>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    setGraph(computeEngramGraph(0.35, 3));
  }, [refreshKey]);

  const W = 520;
  const H = 340;

  const { nodes, edges } = graph;

  if (nodes.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[11px] text-neutral-500">
        <div className="mb-2">Need at least 2 engrams to build a propagation graph.</div>
        <div>Generate code more and the graph will emerge from memory.</div>
      </div>
    );
  }

  // 找到 hovered/selected 节点相关的边，做高亮
  const highlightedEdges = new Set<string>();
  if (hovered || selected) {
    const targetId = (hovered || selected?.id) || "";
    for (const e of edges) {
      if (e.source === targetId || e.target === targetId) {
        highlightedEdges.add(`${e.source}__${e.target}`);
      }
    }
  }

  // 坐标缩放：从 [0,1] 到 [20, W-20] / [20, H-20]
  const toPx = (x: number, y: number) => ({
    cx: 30 + x * (W - 60),
    cy: 30 + y * (H - 60),
  });

  return (
    <div className="flex flex-col w-full">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-neutral-400">
          Engram Propagation Graph · 记忆场 · {nodes.length} nodes · {edges.length} edges
        </span>
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="text-[10px] text-neutral-500 hover:text-neutral-300"
          >
            clear selection
          </button>
        )}
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="bg-neutral-950/60 rounded-lg border border-neutral-800/60">
        {/* 背景网格：淡淡的同心圆 */}
        <circle cx={W / 2} cy={H / 2} r={Math.min(W, H) / 2 - 40} fill="none" stroke="#1f1f2a" strokeWidth="1" strokeDasharray="2 4" />
        <circle cx={W / 2} cy={H / 2} r={(Math.min(W, H) / 2 - 40) * 0.6} fill="none" stroke="#1f1f2a" strokeWidth="1" strokeDasharray="2 4" />
        <circle cx={W / 2} cy={H / 2} r={(Math.min(W, H) / 2 - 40) * 0.25} fill="none" stroke="#1f1f2a" strokeWidth="1" strokeDasharray="2 4" />

        {/* 边（在节点之下） */}
        {edges.map((e) => {
          const a = nodes.find((n) => n.id === e.source);
          const b = nodes.find((n) => n.id === e.target);
          if (!a || !b) return null;
          const pa = toPx(a.x, a.y);
          const pb = toPx(b.x, b.y);
          const key = `${e.source}__${e.target}`;
          const isHL = highlightedEdges.size > 0 && highlightedEdges.has(key);
          const opacity = highlightedEdges.size > 0 ? (isHL ? 0.85 : 0.08) : 0.35 + e.similarity * 0.35;
          const strokeWidth = isHL ? 1.5 : 0.8 + e.similarity * 1.2;
          return (
            <line
              key={key}
              x1={pa.cx}
              y1={pa.cy}
              x2={pb.cx}
              y2={pb.cy}
              stroke="#818cf8"
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
            />
          );
        })}

        {/* 节点 */}
        {nodes.map((n) => {
          const p = toPx(n.x, n.y);
          const hex = getRelationHex(n.dominantRelation);
          const r = 4 + n.radius * 400; // n.radius 在 [0.04, ~0.14] → 实际半径 [20, 60]
          const isSel = selected?.id === n.id;
          const isHov = hovered === n.id;
          const totalSignal = n.signalScore;
          let isHighlighted = false;
          if (highlightedEdges.size > 0) {
            highlightedEdges.forEach((k) => {
              if (k.includes(n.id)) isHighlighted = true;
            });
          }
          const opacity =
            highlightedEdges.size > 0
              ? isSel || isHov || isHighlighted
                ? 1
                : 0.25
              : 1;
          return (
            <g
              key={`node-${n.id}`}
              onClick={() => setSelected(isSel ? null : n)}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer", opacity }}
            >
              {/* 辉光圈（当有 signalScore 时出现） */}
              {totalSignal > 0 && (
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={r + 3 + Math.min(10, totalSignal * 1.5)}
                  fill={hex}
                  fillOpacity={0.06 + Math.min(0.22, totalSignal * 0.03)}
                />
              )}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={r}
                fill={hex}
                fillOpacity={isHov || isSel ? 0.9 : 0.6}
                stroke={isSel ? "#ffffff" : hex}
                strokeWidth={isSel ? 2 : 1}
              />
              {/* 节点文字：self（前 10 字符） */}
              <text
                x={p.cx}
                y={p.cy + r + 12}
                fontSize="9"
                fill="#a3a3a3"
                textAnchor="middle"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {n.self.length > 12 ? n.self.slice(0, 12) + "…" : n.self}
              </text>
            </g>
          );
        })}

        {/* 选中节点的信息卡 */}
        {selected && (() => {
          const p = toPx(selected.x, selected.y);
          const cardW = 200;
          const cardH = 70;
          // 确保信息卡不超出边界
          let cardX = p.cx + 12;
          if (cardX + cardW > W - 8) cardX = p.cx - cardW - 12;
          let cardY = p.cy - cardH / 2;
          if (cardY < 8) cardY = 8;
          if (cardY + cardH > H - 8) cardY = H - cardH - 8;
          return (
            <g>
              <rect
                x={cardX}
                y={cardY}
                width={cardW}
                height={cardH}
                rx={6}
                fill="#0a0a0f"
                stroke={getRelationHex(selected.dominantRelation)}
                strokeWidth={1}
                strokeOpacity={0.5}
              />
              <text
                x={cardX + 10}
                y={cardY + 18}
                fontSize="11"
                fontWeight={600}
                fill={getRelationHex(selected.dominantRelation)}
                fontFamily="ui-sans-serif, system-ui"
              >
                {selected.self.length > 18
                  ? selected.self.slice(0, 18) + "…"
                  : selected.self}
              </text>
              <text x={cardX + 10} y={cardY + 34} fontSize="9.5" fill="#9ca3af">
                dominant: {getRelationLabel(selected.dominantRelation)}
              </text>
              <text x={cardX + 10} y={cardY + 48} fontSize="9.5" fill="#9ca3af">
                signal score: {selected.signalScore}
              </text>
              <text x={cardX + 10} y={cardY + 62} fontSize="9.5" fill="#6b7280">
                generated at {new Date(selected.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* 图例（关系键） */}
      <div className="flex flex-wrap gap-3 mt-3">
        {(["印", "生", "比", "克", "财"] as RelationKey[]).map((k) => (
          <div key={`legend-${k}`} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getRelationHex(k) }}
            />
            <span className="text-[10px] text-neutral-500">
              {k} · {getRelationLabel(k)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
