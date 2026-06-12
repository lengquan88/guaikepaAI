"use client";

import {
  Engram,
  RelationKey,
  clearEngrams,
  findResonantEngrams,
  getAllEngrams,
  getRelationColor,
  getRelationLabel,
  getRelationKeys,
} from "@/lib/engram";
import { SparklesIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface EngramPanelProps {
  prompt: string;
}

// 迷你关系图：把最新 engram 渲染为彩色标签网格
export default function EngramPanel({ prompt }: EngramPanelProps) {
  const [latest, setLatest] = useState<Engram | null>(null);
  const [total, setTotal] = useState(0);
  const [resonantCount, setResonantCount] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  // 当 engram 存储变化（每次生成后都会写）或 prompt 变化时重新读取
  useEffect(() => {
    if (!isMounted) return;
    const all = getAllEngrams();
    setTotal(all.length);
    setLatest(all[0] || null);
    const resonant = findResonantEngrams(prompt);
    setResonantCount(resonant.length);
  }, [isMounted, prompt]);

  // 给按钮留一个点击清除记忆
  const handleClear = () => {
    if (total === 0) return;
    clearEngrams();
    setLatest(null);
    setTotal(0);
    setResonantCount(0);
    toast.success("Cleared long-term memory");
  };

  // 未初始化时不显示，避免 SSR 闪烁
  if (!isMounted) {
    return (
      <div className="px-4 py-3 border-t border-neutral-800/40 bg-neutral-950" />
    );
  }

  // 初始空状态：只显示一条轻量的"还没有记忆"提示
  if (!latest) {
    return (
      <div className="px-4 py-2.5 border-t border-neutral-800/40 bg-neutral-950/50">
        <div className="flex items-center gap-2 text-[11px] text-neutral-600">
          <SparklesIcon className="w-3.5 h-3.5" />
          <span>
            First generation — long-term memory (relation-graphs) will form
            here.
          </span>
        </div>
      </div>
    );
  }

  const relationKeys: RelationKey[] = getRelationKeys();

  return (
    <div className="px-4 py-3 border-t border-neutral-800/40 bg-neutral-950/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20">
            <SparklesIcon className="w-3 h-3 text-indigo-400" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] text-neutral-400">
              {latest.self}
            </span>
            <span className="text-[10px] text-neutral-600">
              {total} engram{total === 1 ? "" : "s"} stored · {resonantCount}
              resonating with current prompt
            </span>
          </div>
        </div>
        <button
          onClick={handleClear}
          title="Clear long-term memory"
          className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors"
        >
          clear memory
        </button>
      </div>

      {/* 关系键 → token 标签网格 */}
      <div className="space-y-1.5">
        {relationKeys.map((k) => {
          const tokens = latest.relations[k] || [];
          if (!tokens.length) return null;
          return (
            <div key={k} className="flex items-start gap-2">
              <span
                className={`shrink-0 w-6 text-[10px] font-medium ${getRelationColor(k)}`}
                title={getRelationLabel(k)}
              >
                {k}
              </span>
              <div className="flex flex-wrap gap-1">
                {tokens.slice(0, 6).map((t, i) => (
                  <span
                    key={`${k}-${i}-${t}`}
                    className={`px-1.5 py-0.5 text-[10px] rounded bg-neutral-900 border border-neutral-800 ${getRelationColor(k)}`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {latest.intent && (
          <div className="pt-1.5 mt-1 border-t border-neutral-800/40 text-[10px] text-neutral-500 italic">
            {`"${latest.intent}"`}
          </div>
        )}
      </div>
    </div>
  );
}
