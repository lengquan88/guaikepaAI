"use client";

import { useMemo, useState, useEffect } from "react";
import {
  type SelfCultivationReading,
  type CultivationGate,
  type CultivationGateStatus,
  selfCultivationRead,
  saveLatestCultivation,
} from "../lib/self-cultivation";

interface Props {
  prompt: string;
  latestCode: string;
  refreshKey: number;
}

function gateStatusColor(status: CultivationGateStatus): string {
  if (status === "open") return "text-emerald-300";
  if (status === "lingering") return "text-amber-300";
  return "text-neutral-500";
}
function gateStatusBg(status: CultivationGateStatus): string {
  if (status === "open") return "bg-emerald-500/10 border-emerald-500/30";
  if (status === "lingering") return "bg-amber-500/10 border-amber-500/30";
  return "bg-neutral-800/40 border-neutral-700/40";
}
function gateBar(status: CultivationGateStatus): string {
  if (status === "open") return "bg-emerald-400";
  if (status === "lingering") return "bg-amber-400";
  return "bg-neutral-600";
}

// 四门 ID 顺序
const GATE_ORDER = ["self-knowledge", "self-mastery", "humility", "stop"] as const;

export default function SelfCultivationPanel({ prompt, latestCode, refreshKey }: Props) {
  const [reading, setReading] = useState<SelfCultivationReading | null>(null);

  useEffect(() => {
    const r = selfCultivationRead(prompt, latestCode);
    setReading(r);
    saveLatestCultivation(r);
  }, [refreshKey, prompt, latestCode]);

  const gates = useMemo(() => {
    if (!reading) return [];
    return GATE_ORDER.map((id) => ({
      id,
      artifact: reading.gates.find((g) => g.id === id)!,
    })).filter((x) => x.artifact);
  }, [reading]);

  if (!reading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-[11px] text-neutral-500">
        待修身门开启……
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-neutral-400">
          修身 · 四门三德 &nbsp;|&nbsp; 已开 {reading.openedCount}/4
        </span>
        <span className="text-[10px] text-neutral-500">
          {reading.virtues.map((v) => v.name).join(" · ")}
        </span>
      </div>

      {/* 四门列表 */}
      <div className="flex flex-col gap-1.5">
        {gates.map(({ id, artifact }) => (
          <div
            key={id}
            className={`flex flex-col px-2.5 py-2 rounded-md border ${gateStatusBg(artifact.status)}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-medium ${gateStatusColor(artifact.status)}`}>
                {artifact.name}
              </span>
              <span className="text-[10px] text-neutral-500">
                {artifact.status === "open"
                  ? "开"
                  : artifact.status === "lingering"
                    ? "徘徊"
                    : "关"}
                &nbsp;· {(artifact.score * 100).toFixed(0)}
              </span>
            </div>
            {/* 进度条 */}
            <div className="w-full h-0.5 mt-1.5 bg-neutral-800/70 rounded-full overflow-hidden">
              <div
                className={`h-full ${gateBar(artifact.status)}`}
                style={{ width: `${Math.min(100, artifact.score * 100).toFixed(0)}%` }}
              />
            </div>
            {/* insight */}
            <div className="text-[10.5px] text-neutral-300 mt-1.5 leading-snug">
              {artifact.insight}
            </div>
          </div>
        ))}
      </div>

      {/* 三德修为分 */}
      <div className="mt-3">
        <div className="text-[10.5px] font-medium text-neutral-400 mb-1.5">
          三德 · 修为分
        </div>
        <div className="flex flex-col gap-1">
          {reading.virtues.map((v) => (
            <div key={v.id} className="flex items-center gap-2">
              <span className="text-[10.5px] text-neutral-300 w-20 shrink-0">
                {v.name}
              </span>
              <div className="flex-1 h-0.5 bg-neutral-800/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400/60"
                  style={{ width: `${(v.normalized * 100).toFixed(0)}%` }}
                />
              </div>
              <span className="text-[9px] text-neutral-500 w-8 text-right tabular-nums">
                {(v.normalized * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
        {/* 三德各一句评语 */}
        <div className="mt-1.5 flex flex-col gap-0.5">
          {reading.virtues.map((v) => (
            <div key={v.id} className="text-[10px] text-neutral-500 leading-snug">
              {v.insight}
            </div>
          ))}
        </div>
      </div>

      {/* 知止门 overload 警报 */}
      {(() => {
        const stopGate = reading.gates.find((g) => g.id === "stop");
        if (stopGate && (stopGate.payload as { alert?: boolean }).alert) {
          return (
            <div className="mt-3 p-2 rounded-md border border-amber-500/30 bg-amber-500/5">
              <div className="text-[10.5px] font-medium text-amber-200 mb-1">
                知止不殆
              </div>
              <div className="text-[10.5px] text-amber-100/90 leading-snug">
                生成有膨胀之势。名与身孰亲？身与货孰多？得与亡孰病？甚爱必大费，多藏必厚亡——是时候停下来审视了。
              </div>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}