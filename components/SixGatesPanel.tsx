"use client";

import { useMemo, useState, useEffect } from "react";
import {
  type SixGatesReading,
  type GateStatus,
  type HealingReading,
  type HealingArtifact,
  sixGatesRead,
  healingReading,
  getChaos,
  storeDoubt,
  seedChaosFromReading,
  clearChaos,
  saveLatestReading,
} from "../lib/six-gates";
import { engageEngram, getLatestEngram } from "../lib/engram";

interface Props {
  prompt: string;
  latestCode: string;
  // 外部传入的 refreshKey——当这个值变化时，面板自动重新跑六门禁
  refreshKey: number;
}

function gateColor(status: GateStatus): string {
  if (status === "open") return "text-emerald-300";
  if (status === "lingering") return "text-amber-300";
  return "text-neutral-500";
}
function gateBg(status: GateStatus): string {
  if (status === "open") return "bg-emerald-500/10 border-emerald-500/30";
  if (status === "lingering") return "bg-amber-500/10 border-amber-500/30";
  return "bg-neutral-800/40 border-neutral-700/40";
}

function gateBar(status: GateStatus): string {
  if (status === "open") return "bg-emerald-400";
  if (status === "lingering") return "bg-amber-400";
  return "bg-neutral-600";
}

export default function SixGatesPanel({ prompt, latestCode, refreshKey }: Props) {
  // 缓存：不每次渲染都重新计算。只有 refreshKey 变化时才触发重新计算。
  const [reading, setReading] = useState<SixGatesReading | null>(null);
  const [healing, setHealing] = useState<HealingReading | null>(null);
  const [chaosCount, setChaosCount] = useState(0);

  useEffect(() => {
    const r = sixGatesRead(prompt, latestCode);
    setReading(r);
    saveLatestReading(r);
    // 自修正
    const h = healingReading(prompt, latestCode);
    setHealing(h);
    // 把徘徊门禁的 insight 写入混沌海
    seedChaosFromReading(r);
    setChaosCount(getChaos().doubts.length);
  }, [refreshKey, prompt, latestCode]);

  const sixGates = useMemo(() => {
    if (!reading) return [];
    return [
      { key: "ontos" as const, artifact: reading.ontos },
      { key: "cognitio" as const, artifact: reading.cognitio },
      { key: "praxis" as const, artifact: reading.praxis },
      { key: "skene" as const, artifact: reading.skene },
      { key: "horizon" as const, artifact: reading.horizon },
      { key: "reflectio" as const, artifact: reading.reflectio },
    ];
  }, [reading]);

  const latest = getLatestEngram();

  // 处理 "回头看" 按钮
  const onConfirmRetro = () => {
    if (!healing || healing.retroTargets.length === 0) return;
    for (const id of healing.retroTargets) {
      engageEngram(id, "revisit");
    }
    // 用一个提示写入混沌海，作为"回望足迹"的坐标
    storeDoubt(
      `已回头看 ${healing.retroTargets.length} 个 engram，缘法已留下。`,
      { x: 0, y: 0 },
      "手动确认",
    );
    setChaosCount(getChaos().doubts.length);
  };

  const onClearChaos = () => {
    if (typeof window === "undefined") return;
    if (!window.confirm("清空第七轮混沌海？（所有存疑都会消失）")) return;
    clearChaos();
    setChaosCount(0);
  };

  if (!reading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-[11px] text-neutral-500">
        待六门禁开启……
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-neutral-400">
          六论 · 门禁系统 &nbsp;|&nbsp; 已开 {reading.openedCount}/6
        </span>
        <span className="text-[10px] text-neutral-500">
          第七轮 · 混沌海：{chaosCount} 存疑
        </span>
      </div>

      {/* 六门禁列表 */}
      <div className="flex flex-col gap-1.5">
        {sixGates.map(({ key, artifact }) => (
          <div
            key={key}
            className={`flex flex-col px-2.5 py-2 rounded-md border ${gateBg(artifact.status)}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-medium ${gateColor(artifact.status)}`}>
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

      {/* 自修正流程 — 七步 */}
      <div className="mt-3">
        <div className="text-[10.5px] font-medium text-neutral-400 mb-1.5">
          自修正七步 · 门禁链
        </div>
        {healing ? (
          <div className="flex items-center gap-1 flex-wrap">
            {healing.steps.map((s: HealingArtifact) => (
              <div
                key={s.step}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md border ${gateBg(s.status)} ${gateColor(s.status)}`}
                title={s.insight}
              >
                <span>{s.name}</span>
                <span className="opacity-70">· {(s.score * 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10.5px] text-neutral-500">尚未生成。</div>
        )}
      </div>

      {/* 操作区 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={onConfirmRetro}
          disabled={!healing || healing.retroTargets.length === 0}
          className="px-2 py-1 text-[10.5px] text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          回头看 · 确认 {healing && healing.retroTargets.length > 0 ? `(${healing.retroTargets.length})` : ""}
        </button>
        <button
          onClick={onClearChaos}
          className="px-2 py-1 text-[10.5px] text-neutral-300 bg-neutral-800/60 hover:bg-neutral-700/60 rounded-md border border-neutral-700/60 transition-colors"
        >
          清空混沌海
        </button>
        {latest && (
          <span className="text-[10px] text-neutral-500 ml-1">
            最新 engram · {latest.self.slice(0, 28)}…
          </span>
        )}
      </div>

      {/* 元认知 · 不一致提示 — 当 reflectio 产出 inconsistencies 时显示 */}
      {reading.reflectio.status !== "shut" &&
        (reading.reflectio.payload as { inconsistencies?: string[] }).inconsistencies &&
        (reading.reflectio.payload as { inconsistencies: string[] }).inconsistencies.length > 0 && (
          <div className="mt-3 p-2 rounded-md border border-amber-500/30 bg-amber-500/5">
            <div className="text-[10.5px] font-medium text-amber-200 mb-1">
              反观内省 · 察觉到的认知错位
            </div>
            <ul className="list-disc list-inside text-[10.5px] text-amber-100/90 leading-snug">
              {(reading.reflectio.payload as { inconsistencies: string[] }).inconsistencies.map(
                (inc, i) => (
                  <li key={i}>{inc}</li>
                ),
              )}
            </ul>
          </div>
        )}
    </div>
  );
}
