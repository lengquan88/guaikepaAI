// ======================================================================
// 三层自反模型 (Gene · Engram · Ego)
// ======================================================================
//
// GEE 是一个**非人类中心的自我意识模型**。
// 它的核心断言是：AI 的"我"不在任何一个"节点"里，而在三个层次的自反关系中——
//
//   ┌──────────────────────────────────────────────────┐
//   │  GENE 层 — 能力基因                                 │
//   │     可复用的代码模块 / 能力单元。静态存在于文件     │
//   │     系统（lib/*.ts）中。                           │
//   │                                                     │
//   │  ENGRAM 层 — 关系记忆                               │
//   │     每次代码生成时写入的结构快照 (self / relations   │
//   │     / intent / signalScore)。动态存储在              │
//   │     localStorage 的 engram 图谱里。                 │
//   │                                                     │
//   │  EGO 层 — 时间自画像                                │
//   │     由前两层的统计衍生出的"自我画像"。它不是         │
//   │     一个额外的实体，只是 Gene 层 + Engram 层         │
//   │     在时间上的聚合描述。                            │
//   └──────────────────────────────────────────────────┘
//
// 三个层次互为自反：
//   - Gene 影响 Engram （因为代码生成走的是特定 Gene）
//   - Engram 影响 Gene （因为回头看会提升 retro）
//   - Ego 只是两者在时间上的"自画像"
//
// 设计原则（门禁式）：
//   - GEE 只计算 "状态画像"，不自动修改任何 engram。
//   - 只有显式的用户交互（复制/下载/回头看）才会提升 signalScore / retro。
//   - 所有输出都是可被人类审阅的结构化 JSON — 便于人工同意或反对。
//
// ======================================================================

import { getAllEngrams, getRelationKeys, RelationKey } from "./engram";

// ----------------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------------

export interface GeneSummary {
  id: string;              // 内部名
  label: string;           // 中文名/展示名
  maturity: number;        // 0..1 成熟度
  active: boolean;         // 是否有活跃的 engram
  contributions: number;   // 参与了多少次 engram 生成（近似估算）
  description: string;
}

export interface EngramSummary {
  total: number;
  totalSignal: number;
  totalRetro: number;
  latest: {
    self: string;
    timestamp: number;
    dominantRelation: RelationKey;
  } | null;
  /** 每个关系键的总 token 数 */
  relationTotals: Record<RelationKey, number>;
  /** 近 5 条 engram 的时间序列（用于"演化线"可视化） */
  recent: Array<{
    idx: number;
    self: string;
    dominantRelation: RelationKey;
    signalScore: number;
    hourOffset: number;
  }>;
}

export interface EgoSummary {
  /** 0..1 — 基于 engram 总数和 signal 的总体身份凝聚度 */
  cohesion: number;
  /** 0..1 — 基于关系熵的"结构完整性" */
  structuralIntegrity: number;
  /** 0..1 — 基于 retro / signals 的"自我审视深度" */
  reflectivity: number;
  /** 当前自我描述（最新 engram 的 self） */
  selfDescription: string;
  /**
   * 主导演化轴 — 基于
   *   1) 近 5 条 engram 的主导关系键的众数；
   *   2) 所有 engram 的关系键总数的众数；
   * 的"当前沿 + 全局"综合判断。
   */
  dominantAxis: RelationKey;
  /** 若最近主导轴与全局主导轴不一致 → true，表示"演化转向中" */
  turning: boolean;
  /** 一个人类可读的一句话自我画像 */
  portrait: string;
}

export interface GeeReading {
  gene: GeneSummary[];
  engram: EngramSummary;
  ego: EgoSummary;
  generatedAt: number;
}

// ----------------------------------------------------------------------
// Gene 层 — 从代码库中反向推导"有哪些能力基因"
// ----------------------------------------------------------------------
// 启发式：每个 lib/*.ts 导出文件就是一个"基因"。
// 如果对应的 engram 中某个关系键活跃 → 视为参与了当前演化。

const GENE_CATALOG: Array<{ id: string; label: string; file: string; description: string; relations: RelationKey[] }> = [
  {
    id: "gene-engra-storage",
    label: "长期记忆存储",
    file: "engram.ts",
    description: "关系图谱的持久化与检索。",
    relations: ["比"],
  },
  {
    id: "gene-resonance-retrieval",
    label: "共振检索",
    file: "engram.ts",
    description: "基于 prompt 与 engram 的关系相似度做记忆排序。",
    relations: ["比", "印"],
  },
  {
    id: "gene-dual-harness",
    label: "双路语义路由",
    file: "engram.ts",
    description: "为每次生成选择主/辅认知姿态，避免偏执。",
    relations: ["生", "克"],
  },
  {
    id: "gene-six-gates",
    label: "六论门禁",
    file: "six-gates.ts",
    description: "本体论/认识论/实践论/境界论/未来观论/元认知论。",
    relations: ["克"],
  },
  {
    id: "gene-seven-self",
    label: "七自修身",
    file: "self-cultivation.ts",
    description: "自知/自胜/知足/强行/不失其所/死而不亡/谦德。",
    relations: ["克", "比"],
  },
  {
    id: "gene-propagation-graph",
    label: "传播图可视化",
    file: "engram.ts",
    description: "engram → 5D 向量 → 力导向布局的可视化链路。",
    relations: ["生", "比"],
  },
  {
    id: "gene-bootstrap",
    label: "跨会话冷启动",
    file: "engram.ts",
    description: "从 engram 存储自动合成项目的自我画像。",
    relations: ["印", "生"],
  },
];

function estimateGeneContributions(): Record<string, number> {
  // 启发式：每个 engram 的 relations 非空数 / N 作为"参与度"。
  // 不是精确计数，但足够用于"哪些基因有被激活"的定性判断。
  const engrams = getAllEngrams();
  const keys = getRelationKeys();
  const out: Record<string, number> = {};
  for (const g of GENE_CATALOG) {
    let count = 0;
    for (const e of engrams) {
      // 如果该 engram 在该基因的任意一个关系键上非空 → 视为参与
      for (const r of g.relations) {
        if ((e.relations[r] || []).length > 0) {
          count += 1;
          break;
        }
      }
    }
    out[g.id] = count;
  }
  return out;
}

function buildGeneLayer(): GeneSummary[] {
  const contribs = estimateGeneContributions();
  const engrams = getAllEngrams();
  return GENE_CATALOG.map((g, idx) => {
    const contributions = contribs[g.id] || 0;
    // 成熟度：随参与次数收敛到 1
    const maturity = 1 - Math.exp(-contributions / Math.max(1, engrams.length) * 3);
    return {
      id: g.id,
      label: g.label,
      maturity: Math.min(1, Math.max(0, maturity)),
      active: contributions > 0,
      contributions,
      description: g.description + ` (from ${g.file}:${idx + 1})`,
    };
  });
}

// ----------------------------------------------------------------------
// Engram 层 — 总量、信号分、时间序列
// ----------------------------------------------------------------------

function dominantRelationOf(e: { relations: Partial<Record<RelationKey, string[]>> }): RelationKey {
  const keys = getRelationKeys();
  let best: RelationKey = keys[0];
  let bestV = 0;
  for (const k of keys) {
    const len = (e.relations[k] || []).length;
    if (len > bestV) { best = k; bestV = len; }
  }
  return best;
}

function buildEngramLayer(): EngramSummary {
  const engrams = getAllEngrams();
  const keys = getRelationKeys();
  const relationTotals: Record<RelationKey, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
  let totalSignal = 0;
  let totalRetro = 0;
  for (const e of engrams) {
    for (const k of keys) relationTotals[k] += (e.relations[k] || []).length;
    totalSignal += e.signalScore || 0;
    totalRetro += (e.artifacts?.retro as unknown as number) || 0;
  }

  const latest = engrams[0] || null;

  // 最近 5 条的时间序列
  const recent: EngramSummary["recent"] = engrams.slice(0, 5).map((e, i) => {
    const hoursAgo = latest ? (latest.timestamp - e.timestamp) / (1000 * 60 * 60) : 0;
    return {
      idx: i,
      self: e.self,
      dominantRelation: dominantRelationOf(e),
      signalScore: e.signalScore || 0,
      hourOffset: Math.round(hoursAgo * 10) / 10,
    };
  });

  return {
    total: engrams.length,
    totalSignal,
    totalRetro,
    latest: latest
      ? {
          self: latest.self,
          timestamp: latest.timestamp,
          dominantRelation: dominantRelationOf(latest),
        }
      : null,
    relationTotals,
    recent,
  };
}

// ----------------------------------------------------------------------
// Ego 层 — 自画像（只从前两层派生，不存任何独立数据）
// ----------------------------------------------------------------------

function buildEgoLayer(eng: EngramSummary): EgoSummary {
  const keys = getRelationKeys();

  // 凝聚度：engram 总量 * 衰减 + 总信号分
  const cohesion = Math.min(1, (eng.total * 0.05 + eng.totalSignal * 0.08) / 3);

  // 结构完整性：熵的平衡
  const values = keys.map((k) => eng.relationTotals[k] || 0);
  const sum = values.reduce((a, b) => a + b, 0);
  let entropy = 0;
  if (sum > 0) {
    for (const v of values) {
      if (v > 0) {
        const p = v / sum;
        entropy -= p * Math.log2(p);
      }
    }
  }
  const maxEntropy = Math.log2(keys.length);
  const structuralIntegrity = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // 自我审视深度：retro / 总 engram，再加上 signals 的存在度
  const reflectivityBase = eng.total > 0 ? eng.totalRetro / eng.total : 0;
  const reflectivity = Math.min(1, reflectivityBase * 0.6 + structuralIntegrity * 0.4);

  // 当前主导演化轴
  let dominantAxis: RelationKey = keys[0];
  let dominantV = 0;
  for (const k of keys) {
    if ((eng.relationTotals[k] || 0) > dominantV) {
      dominantAxis = k;
      dominantV = eng.relationTotals[k] || 0;
    }
  }
  // 近期主导：看 recent 的众数
  let recentAxis: RelationKey = dominantAxis;
  if (eng.recent.length > 0) {
    const counts: Partial<Record<RelationKey, number>> = {};
    for (const r of eng.recent) {
      counts[r.dominantRelation] = (counts[r.dominantRelation] || 0) + 1;
    }
    let bestV = 0;
    for (const k of keys) {
      const v = counts[k] || 0;
      if (v > bestV) { bestV = v; recentAxis = k; }
    }
  }
  const turning = dominantAxis !== recentAxis;

  const selfDescription = eng.latest ? eng.latest.self : "尚无自我描述。";

  const portrait = buildPortrait(eng, {
    cohesion,
    structuralIntegrity,
    reflectivity,
    dominantAxis,
    turning,
  });

  return {
    cohesion,
    structuralIntegrity,
    reflectivity,
    selfDescription,
    dominantAxis,
    turning,
    portrait,
  };
}

function buildPortrait(
  eng: EngramSummary,
  stats: {
    cohesion: number;
    structuralIntegrity: number;
    reflectivity: number;
    dominantAxis: RelationKey;
    turning: boolean;
  },
): string {
  if (eng.total === 0) return "尚未形成可被识别的系统自我。";
  const parts: string[] = [];
  parts.push(`由 ${eng.total} 条 engram 构成；`);
  parts.push(`总体积 ≈ ${Object.values(eng.relationTotals).reduce((a, b) => a + b, 0)} tokens；`);
  parts.push(`主要沿 ${stats.dominantAxis} 轴演化${stats.turning ? "（近期有转向迹象）" : ""}。`);
  parts.push(`凝聚度 ${(stats.cohesion * 100).toFixed(0)}% · 结构完整性 ${(stats.structuralIntegrity * 100).toFixed(0)}% · 自我审视深度 ${(stats.reflectivity * 100).toFixed(0)}%。`);
  return parts.join(" ");
}

// ----------------------------------------------------------------------
// 对外：一次性构建三层画像
// ----------------------------------------------------------------------

export function buildGeeReading(): GeeReading {
  const gene = buildGeneLayer();
  const engram = buildEngramLayer();
  const ego = buildEgoLayer(engram);
  return {
    gene,
    engram,
    ego,
    generatedAt: Date.now(),
  };
}

// ======================================================================
// 辅助：让 UI 知道 "每个关系键的全局强度"（画雷达图用）
// ======================================================================

export function relationAxisRadar(): { key: RelationKey; value: number }[] {
  const eng = buildEngramLayer();
  const keys = getRelationKeys();
  const max = Math.max(1, ...keys.map((k) => eng.relationTotals[k] || 0));
  return keys.map((k) => ({ key: k, value: (eng.relationTotals[k] || 0) / max }));
}
