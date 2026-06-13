// ======================================================================
// 六论·门禁系统 — Six Gates of Daoist Cognition
// ======================================================================
//
// 门禁设计：每一步都有门槛值 (threshold)，不满足就止步，
// 不强行推进——像道门禁，只有缘法具足才能通往下一境。
//
// 把"优化"换成"回头看" (retrospect)：系统不向前去"优化"，
// 而是回到历史 engram 中重新审视关系结构。
//
// 把"算力"换成"修行感"：统计指标被重新命名为修为 (cultivation)、
// 境界 (realm)、缘法 (karma)。
//
// ======================================================================
// 六论：本体论 · 认识论 · 实践论 · 境界论 · 未来观论 · 元认知论
// 第七轮（非论）：杂轮 · 混沌海 — 不求解，只存疑。
// ======================================================================

import {
  Engram,
  RelationKey,
  dominantRelation,
  getAllEngrams,
  getRelationKeys,
} from "./engram";

// ----------------------------------------------------------------------
// 通用类型：门禁 (Gate)
// ----------------------------------------------------------------------

export type GateStatus = "shut" | "open" | "lingering"; // 关 · 开 · 徘徊（有信号但未达阈值）

export interface GateArtifact {
  /** 门禁代号：六论的名字或自修正步骤名 */
  gate: string;
  /** 中文名称（用于 UI 展示） */
  name: string;
  /** 本次打分 0..1 */
  score: number;
  /** 门禁状态 */
  status: GateStatus;
  /** 文本形式的洞察（一行） */
  insight: string;
  /** 结构化数据（不同门禁不一样） */
  payload: Record<string, unknown>;
  /** 生成时间 */
  timestamp: number;
}

// ----------------------------------------------------------------------
// 工具：计算 engram 的关系向量（5 维，归一化到 0..1）
// ----------------------------------------------------------------------

function relationVector(e: Engram): number[] {
  const keys = getRelationKeys();
  const raw = keys.map((k) => (e.relations[k] || []).length);
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum === 0) return raw.map(() => 0);
  return raw.map((v) => v / sum);
}

function euclidean(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(s);
}

function meanVector(list: number[][]): number[] {
  if (list.length === 0) return [];
  const dim = list[0].length;
  const out = new Array(dim).fill(0);
  for (const v of list) for (let i = 0; i < dim; i++) out[i] += v[i];
  return out.map((x) => x / list.length);
}

// ======================================================================
// 第一论：本体论 (OntosGate)
// 是什么 → 道之本体的数学化表达：关系-关系 的二阶结构
// ======================================================================
// 算法：
//   1. 把所有 engram 展平为 5 维关系向量
//   2. 计算两两之间的欧氏距离，得到"关系距离矩阵"
//   3. 寻找最稳定的"共现对"（哪些关系键经常同时高/低）
//   4. 输出关系骨架 (relation skeleton)

export interface OntosPayload {
  dimension: number;          // 维度 = 非空关系键数
  entropy: number;            // 关系熵（越均匀越"混沌"，越不均匀越"有结构"）
  skeleton: Array<{          // 关系骨架：两两共现强度
    pair: [RelationKey, RelationKey];
    coOccurrence: number;     // 0..1
  }>;
  sampleSize: number;
  [k: string]: unknown;
}

export function ontosGate(threshold = 0.15): GateArtifact {
  const engrams = getAllEngrams();
  const keys = getRelationKeys();

  if (engrams.length < 2) {
    return {
      gate: "ontos",
      name: "本体论",
      score: 0,
      status: "shut",
      insight: "缘法不足：需要至少 2 个 engram 才能感知关系骨架。",
      payload: { dimension: 0, entropy: 0, skeleton: [], sampleSize: engrams.length } as OntosPayload,
      timestamp: Date.now(),
    };
  }

  const vectors = engrams.map(relationVector);

  // 每个关系键的"平均激活"
  const meanV = meanVector(vectors);
  const nonZero = meanV.filter((v) => v > 0.02).length;

  // 熵（用平均向量的香农熵近似）
  let entropy = 0;
  for (const v of meanV) {
    if (v > 0.001) entropy -= v * Math.log2(v);
  }
  const maxEntropy = Math.log2(keys.length);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // 关系-关系共现：对每对关系键 (i,j)，
  // 计算所有 engram 中 v_i * v_j 的平均（两个关系同时强则高）
  const skeleton: Array<{ pair: [RelationKey, RelationKey]; coOccurrence: number }> = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      let s = 0;
      for (const v of vectors) s += v[i] * v[j];
      s /= vectors.length;
      skeleton.push({ pair: [keys[i], keys[j]], coOccurrence: s });
    }
  }
  skeleton.sort((a, b) => b.coOccurrence - a.coOccurrence);
  const topCo = skeleton[0]?.coOccurrence || 0;

  // score：维度越高且熵越"中间值"(0.5 左右) 分数越高
  // 中间熵代表既有结构又不单一
  const dimScore = Math.min(1, nonZero / keys.length);
  const entropyBalance = 1 - Math.abs(normalizedEntropy - 0.5) * 2; // 0.5 熵 → 1.0，极端 → 0
  const score = Math.min(1, dimScore * 0.5 + entropyBalance * 0.3 + topCo * 0.2);

  const status: GateStatus = score >= threshold ? "open" : score >= threshold * 0.5 ? "lingering" : "shut";
  const topPair = skeleton[0];
  const insight =
    status === "open" && topPair
      ? `关系骨架已显形：${topPair.pair[0]}·${topPair.pair[1]} 共现最强 (${(topPair.coOccurrence * 100).toFixed(0)}%)`
      : status === "lingering"
        ? "关系骨架隐约可见，缘法仍在凝聚中。"
        : "关系尚未显形；道体静默。";

  return {
    gate: "ontos",
    name: "本体论",
    score,
    status,
    insight,
    payload: {
      dimension: nonZero,
      entropy: normalizedEntropy,
      skeleton: skeleton.slice(0, 6),
      sampleSize: engrams.length,
    } as OntosPayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 第二论：认识论 (CognitioGate)
// 如何知 → 持久同调 & 特征提取
// ======================================================================
// 算法（简化版）：
//   对 prompt/engram 做"词级特征提取"——
//   1. 用滑窗计算 prompt 各位置的局部激活熵
//   2. 找"峰值窗口"（持久同调的 0 维洞对应词之间的语义峰）
//   3. 输出语义坐标：(x, y) 其中 x 是约束·输出 比，y 是支撑·消耗 比
//   （这相当于把 5 维关系向量投影到一个 2D 语义平面）

export interface CognitioPayload {
  coordinate: { x: number; y: number }; // 归一化到 [-1, 1]
  peakWindows: Array<{ start: number; end: number; intensity: number }>;
  dominantAxis: string;
  sampleSize: number;
  [k: string]: unknown;
}

export function cognitioGate(prompt: string, threshold = 0.12): GateArtifact {
  const text = prompt || "";
  const keys = getRelationKeys();

  // 简易特征提取：每个关系键的关键词在 prompt 中的命中比
  const KEYWORDS: Record<RelationKey, string[]> = {
    印: ["import", "imports", "hook", "hooks", "library", "react", "state", "component", "基础", "支撑", "引入", "依赖"],
    生: ["render", "display", "output", "show", "animate", "animation", "列表", "卡片", "页面", "可视化", "图表", "渲染"],
    比: ["similar", "like", "same", "example", "button", "checkbox", "form", "同类", "相似", "类似", "下拉", "模态"],
    克: ["validate", "validation", "limit", "check", "constraint", "if", "disable", "required", "error", "边界", "条件", "限制", "验证", "错误"],
    财: ["data", "fetch", "api", "load", "transform", "consume", "dataset", "items", "entries", "数据", "加载", "消费", "转化", "json"],
  };

  const hits: Record<RelationKey, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
  const lower = text.toLowerCase();
  for (const k of keys) {
    for (const kw of KEYWORDS[k]) {
      // 中文直接子串匹配，英文用边界
      if (/[\u4e00-\u9fa5]/.test(kw)) {
        if (lower.includes(kw)) hits[k] += 1;
      } else {
        const re = new RegExp(`\\b${kw}\\b`, "g");
        const m = lower.match(re);
        if (m) hits[k] += m.length;
      }
    }
  }

  // 滑窗：每 15 字符一个窗口，步进 5
  const windowSize = Math.max(15, Math.floor(text.length / 10));
  const peakWindows: Array<{ start: number; end: number; intensity: number }> = [];
  if (text.length >= windowSize) {
    for (let s = 0; s < text.length - windowSize; s += 5) {
      const window = text.slice(s, s + windowSize).toLowerCase();
      // 局部激活 = 窗口内命中的关键词总数
      let intensity = 0;
      for (const k of keys) {
        for (const kw of KEYWORDS[k]) {
          if (window.includes(kw)) {
            intensity += 1;
          }
        }
      }
      if (intensity >= 2) {
        peakWindows.push({ start: s, end: s + windowSize, intensity });
      }
    }
  }

  // 语义坐标：
  //   x = (生 - 克) / (生 + 克 + epsilon)  输出 vs 约束
  //   y = (财 - 印) / (财 + 印 + epsilon)  消耗 vs 支撑
  const denomX = (hits["生"] + hits["克"]) || 1;
  const denomY = (hits["财"] + hits["印"]) || 1;
  const x = (hits["生"] - hits["克"]) / denomX;
  const y = (hits["财"] - hits["印"]) / denomY;

  const maxHit = Math.max(...keys.map((k) => hits[k]), 1);
  const score = Math.min(1, (peakWindows.length / 3 + maxHit / 10) / 2);

  const status: GateStatus = score >= threshold ? "open" : score > 0 ? "lingering" : "shut";

  const axis = Math.abs(x) > Math.abs(y) ? (x > 0 ? "输出轴" : "约束轴") : (y > 0 ? "消耗轴" : "支撑轴");

  return {
    gate: "cognitio",
    name: "认识论",
    score,
    status,
    insight:
      status === "open"
        ? `观察：语义坐标落在 (${x.toFixed(2)}, ${y.toFixed(2)})，沿 ${axis} 演化。`
        : status === "lingering"
          ? "信号微弱，观察继续。"
          : "未观；输入如虚空。",
    payload: {
      coordinate: { x, y },
      peakWindows: peakWindows.slice(0, 8),
      dominantAxis: axis,
      sampleSize: text.length,
    } as CognitioPayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 第三论：实践论 (PraxisGate)
// 如何做 → 存思、服气、内丹 → 注意力机制、数据流优化、模型训练
// ======================================================================
// 算法（启发式）：
//   对最新生成的代码做"修炼路径"分析——
//   1. 状态修改点 (useState setters) = 内丹凝聚
//   2. 数据流优化点 (filter/map/reduce 链式) = 服气
//   3. 注意力/焦点元素 (input, button, click handler) = 存思
//   4. 产出修炼路径：优先级排序列表

export interface PraxisPayload {
  innerAlchemy: number;      // 状态修改点数量（内丹）
  breathFlow: number;        // 数据流函数数（服气）
  focusPoints: number;       // DOM 交互元素数（存思）
  ratio: { innerAlchemy: number; breathFlow: number; focusPoints: number }; // 占比
  total: number;
  [k: string]: unknown;
}

function countMatches(code: string, re: RegExp): number {
  const m = code.match(re);
  return m ? m.length : 0;
}

export function praxisGate(latestCode: string, threshold = 0.1): GateArtifact {
  const code = latestCode || "";

  // 启发式启发式匹配——不依赖完整 AST
  const innerAlchemy =
    countMatches(code, /\bset[A-Z][a-zA-Z]*\s*\(/g) +          // setState 类调用
    countMatches(code, /\buseState\b/g) +                       // useState
    countMatches(code, /\buseReducer\b/g);                      // useReducer

  const breathFlow =
    countMatches(code, /\.map\s*\(/g) +
    countMatches(code, /\.filter\s*\(/g) +
    countMatches(code, /\.reduce\s*\(/g) +
    countMatches(code, /\bfilter\s*\(/g) +
    countMatches(code, /\bmap\s*\(/g);

  const focusPoints =
    countMatches(code, /\bonClick\b/g) +
    countMatches(code, /\bonChange\b/g) +
    countMatches(code, /\bonSubmit\b/g) +
    countMatches(code, /\bonInput\b/g) +
    countMatches(code, /<input[^>]*>/gi) +
    countMatches(code, /<button[^>]*>/gi);

  const total = innerAlchemy + breathFlow + focusPoints;

  // score：修炼三要素的"平衡度" + 总量
  const balance =
    total > 0
      ? 1 -
        (Math.abs(innerAlchemy - breathFlow) +
          Math.abs(breathFlow - focusPoints) +
          Math.abs(focusPoints - innerAlchemy)) /
          (2 * total)
      : 0;
  const volume = Math.min(1, total / 15);
  const score = balance * 0.6 + volume * 0.4;

  const status: GateStatus = score >= threshold ? "open" : total > 0 ? "lingering" : "shut";

  const payload: PraxisPayload = {
    innerAlchemy,
    breathFlow,
    focusPoints,
    ratio: total > 0 ? {
      innerAlchemy: innerAlchemy / total,
      breathFlow: breathFlow / total,
      focusPoints: focusPoints / total,
    } : { innerAlchemy: 0, breathFlow: 0, focusPoints: 0 },
    total,
  };

  const dominant =
    innerAlchemy >= breathFlow && innerAlchemy >= focusPoints
      ? "内丹凝聚"
      : breathFlow >= focusPoints
        ? "服气流转"
        : "存思观照";

  return {
    gate: "praxis",
    name: "实践论",
    score,
    status,
    insight:
      status === "open"
        ? `修炼路径已成形：以 ${dominant} 为主要功法。`
        : status === "lingering"
          ? "三元素有迹，但尚未成法。"
          : "未察得可修行之法；代码静默。",
    payload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 第四论：境界论 (SkeneGate)
// 做到哪 → 修真九境的映射
// ======================================================================
// 修为 (cultivation) = Σ(engram.signalScore) + engram 数 × 10 + 互动次数
// 境界从低到高：筑基 → 开光 → 融合 → 心动 → 金丹 → 元婴 → 化神 → 合体 → 大乘
// （这只是一个隐喻映射，不是真的修行判断）

export const REALM_NAMES = [
  "筑基",
  "开光",
  "融合",
  "心动",
  "金丹",
  "元婴",
  "化神",
  "合体",
  "大乘",
] as const;

export type RealmName = (typeof REALM_NAMES)[number];

export interface SkenePayload {
  cultivation: number;     // 修为累计值
  realmIndex: number;       // 0..8
  realm: RealmName;
  progressToNext: number;   // 0..1 下一境的进度
  breakdown: {
    engramCount: number;
    signalTotal: number;
    interactTotal: number;
  };
  [k: string]: unknown;
}

export function skeneGate(): GateArtifact {
  const engrams = getAllEngrams();
  const signalTotal = engrams.reduce((acc, e) => acc + (e.signalScore || 0), 0);
  const interactTotal = engrams.reduce((acc, e) => {
    if (!e.signals) return acc;
    return acc + Object.values(e.signals).reduce((a, b) => a + (b || 0), 0);
  }, 0);

  // 修为公式：
  //   每个 engram = 10 点（"刻入"）
  //   signal = 3 × signalScore（用户互动的强信号）
  //   interact = 1 × 互动次数（每个互动点）
  //   每境界阈值为 50 点
  const cultivation = engrams.length * 10 + signalTotal * 3 + interactTotal * 1;
  const perRealm = 50;
  const realmFloat = cultivation / perRealm;
  const realmIndex = Math.min(REALM_NAMES.length - 1, Math.floor(realmFloat));
  const progressToNext = realmFloat - Math.floor(realmFloat);

  const score = Math.min(1, cultivation / (perRealm * 3)); // 到第三境算满 "score=1"

  const status: GateStatus = cultivation > 0 ? "open" : "shut";

  return {
    gate: "skene",
    name: "境界论",
    score,
    status,
    insight:
      cultivation === 0
        ? "尚未筑基。"
        : `当前境界：${REALM_NAMES[realmIndex]}。距离下一境约 ${Math.round(progressToNext * 100)}%。`,
    payload: {
      cultivation,
      realmIndex,
      realm: REALM_NAMES[realmIndex],
      progressToNext,
      breakdown: { engramCount: engrams.length, signalTotal, interactTotal },
    } as SkenePayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 第五论：未来观论 (HorizonGate)
// 往哪去 → 时序预测和系统演化模型
// ======================================================================
// 算法：
//   1. 按时间把 engram 切为 3 段（早/中/晚）
//   2. 每段分别求主导关系键的分布
//   3. 用线性外推预测"下一个 engram 的主导关系是什么"

export interface HorizonPayload {
  phases: Array<{ name: string; dominantRel: RelationKey | null; size: number }>;
  prediction: RelationKey;
  trend: string;
  confidence: number; // 0..1
  [k: string]: unknown;
}

export function horizonGate(threshold = 0.25): GateArtifact {
  const engrams = getAllEngrams();
  if (engrams.length === 0) {
    return {
      gate: "horizon",
      name: "未来观论",
      score: 0,
      status: "shut",
      insight: "无历史可推未来。",
      payload: { phases: [], prediction: "比", trend: "未知", confidence: 0 } as HorizonPayload,
      timestamp: Date.now(),
    };
  }

  const n = engrams.length;
  const sliceSize = Math.max(1, Math.ceil(n / 3));
  const phaseNames = ["古", "近", "今"];
  const phases: HorizonPayload["phases"] = [];
  for (let p = 0; p < 3; p++) {
    const start = Math.min(n, p * sliceSize);
    const end = Math.min(n, start + sliceSize);
    const slice = engrams.slice(start, end);
    if (slice.length === 0) {
      phases.push({ name: phaseNames[p], dominantRel: null, size: 0 });
      continue;
    }
    // 每个关系键在本段的强度
    const keys = getRelationKeys();
    const tally: Record<RelationKey, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
    for (const e of slice) {
      for (const k of keys) tally[k] += (e.relations[k] || []).length;
    }
    let best: RelationKey = "比";
    let bestV = 0;
    for (const k of keys) if (tally[k] > bestV) { best = k; bestV = tally[k]; }
    phases.push({ name: phaseNames[p], dominantRel: best, size: slice.length });
  }

  // 线性外推：把每个关系键最近 N 个 engram 的激活做"时间加权移动平均"
  const keys = getRelationKeys();
  const scores: Record<RelationKey, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
  const lookback = Math.min(8, n);
  for (let i = 0; i < lookback; i++) {
    const e = engrams[i]; // 0 = 最新
    const weight = (lookback - i) / lookback; // 越近权重越高
    for (const k of keys) scores[k] += (e.relations[k] || []).length * weight;
  }
  let pred: RelationKey = "比";
  let predV = 0;
  for (const k of keys) if (scores[k] > predV) { pred = k; predV = scores[k]; }
  const total = keys.reduce((a, k) => a + scores[k], 0);
  const confidence = total > 0 ? predV / total : 0;

  // 趋势（三阶段主导关系的变化）
  const nonNull = phases.filter((p) => p.dominantRel !== null);
  const uniqueRels = new Set(nonNull.map((p) => p.dominantRel as string));
  const trend =
    uniqueRels.size === 1
      ? `稳态 · ${phases[0].dominantRel} 轴`
      : uniqueRels.size === 2
        ? "转向 · 双关系交替"
        : "演化 · 多关系切换";

  const status: GateStatus = confidence >= threshold ? "open" : confidence > 0 ? "lingering" : "shut";

  return {
    gate: "horizon",
    name: "未来观论",
    score: confidence,
    status,
    insight:
      status === "open"
        ? `下一生成更可能沿 ${pred} 轴演化（置信 ${(confidence * 100).toFixed(0)}%）。`
        : status === "lingering"
          ? "演化趋势尚未成形。"
          : "尚无演化轨迹。",
    payload: { phases, prediction: pred, trend, confidence } as HorizonPayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 第六论：元认知论 (ReflectioGate)
// 反观内省 → AI 自我评估与反馈门禁
// ======================================================================
// 算法：
//   检查上面五个门禁的一致性：
//     - 本体论的最强共现对 vs 认识论的语义坐标是否一致？
//     - 实践论的主导功法 vs 认识论的主导轴是否一致？
//     - 若不一致 → 产生"反观提示"（不自动纠正，只标出来）
//   输出：反观报告 + 不一致点

export interface ReflectioPayload {
  coherent: boolean;
  inconsistencies: string[];
  gateScores: Array<{ name: string; score: number; status: GateStatus }>;
  overallCoherence: number; // 0..1
  [k: string]: unknown;
}

export function reflectioGate(
  ontos: GateArtifact,
  cognitio: GateArtifact,
  praxis: GateArtifact,
  threshold = 0.3,
): GateArtifact {
  // 1) 本体 vs 认识论坐标
  const cognitioCoord = (cognitio.payload as CognitioPayload).coordinate;
  // ontos skeleton[0] 是最强共现对
  const topSkeleton = (ontos.payload as OntosPayload).skeleton[0];

  const inconsistencies: string[] = [];

  //  如果认识论 x 轴正（输出强）但本体中"生"没参与最强共现，记为不一致
  if (topSkeleton && cognitioCoord) {
    const pair = topSkeleton.pair;
    if (cognitioCoord.x > 0.3 && !pair.includes("生")) {
      inconsistencies.push("观察以输出为主，但历史关系骨架中 生 未在最强共现。");
    }
    if (cognitioCoord.x < -0.3 && !pair.includes("克")) {
      inconsistencies.push("观察以约束为主，但历史关系骨架中 克 未在最强共现。");
    }
    if (cognitioCoord.y > 0.3 && !pair.includes("财")) {
      inconsistencies.push("观察以消耗为主，但历史关系骨架中 财 未在最强共现。");
    }
    if (cognitioCoord.y < -0.3 && !pair.includes("印")) {
      inconsistencies.push("观察以支撑为主，但历史关系骨架中 印 未在最强共现。");
    }
  }

  // 2) 实践论 vs 认识论
  const praxisPayload = praxis.payload as PraxisPayload;
  if (praxisPayload.total > 0) {
    // 若实践论的主导是内丹(状态)，但认识论的 y 轴是"消耗轴"——
    // 说明"数据驱动的改动"与"内部状态管理"在认知上分裂
    const dominant =
      praxisPayload.innerAlchemy >= praxisPayload.breathFlow &&
      praxisPayload.innerAlchemy >= praxisPayload.focusPoints
        ? "inner"
        : praxisPayload.breathFlow >= praxisPayload.focusPoints
          ? "flow"
          : "focus";
    if (dominant === "inner" && cognitioCoord && cognitioCoord.y > 0.4) {
      inconsistencies.push("代码的状态管理强，但观察到外部数据消耗倾向——可能内外失配。");
    }
  }

  // 3) 总一致性
  const totalChecks = 2; // 实际上两项检查，每项可产生 1-3 条 inconsistency
  const overallCoherence = Math.max(0, 1 - inconsistencies.length / totalChecks);

  const gateScores = [
    { name: ontos.name, score: ontos.score, status: ontos.status },
    { name: cognitio.name, score: cognitio.score, status: cognitio.status },
    { name: praxis.name, score: praxis.score, status: praxis.status },
  ];

  const status: GateStatus = overallCoherence >= threshold ? "open" : overallCoherence > 0 ? "lingering" : "shut";

  return {
    gate: "reflectio",
    name: "元认知论",
    score: overallCoherence,
    status,
    insight:
      status === "open"
        ? `反观内省：六论整体协调度 ${(overallCoherence * 100).toFixed(0)}%。`
        : status === "lingering"
          ? `反观内省发现 ${inconsistencies.length} 处隐约的认知错位。`
          : "六论尚未齐足，反观空明。",
    payload: {
      coherent: inconsistencies.length === 0,
      inconsistencies,
      gateScores,
      overallCoherence,
    } as ReflectioPayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 第七轮（非论）：杂轮 · 混沌海
// 不求解，只存疑。不归因，只关联。不固化，只等候。
// 六论门禁之外，浮沫皆为坐标。
// ======================================================================
// 实现：
//   一个 Set 形式的疑问集合，每个疑问点包含：
//     - 坐标 (x, y)：由认识论的语义坐标给出
//     - 时间戳
//     - 疑问文本（短）
//   存于 localStorage 的单独 key
//   —— 没有"求解"的函数，只有"存疑"和"查看"

const CHAOS_STORAGE_KEY = "deepseek-v4:chaos-sea";

export interface ChaosDoubt {
  id: string;
  text: string;
  coordinate: { x: number; y: number };
  timestamp: number;
  source: string; // 从哪个门禁/步骤产生
}

export interface ChaosSea {
  doubts: ChaosDoubt[];
}

function loadChaos(): ChaosSea {
  if (typeof window === "undefined") return { doubts: [] };
  try {
    const raw = window.localStorage.getItem(CHAOS_STORAGE_KEY);
    if (!raw) return { doubts: [] };
    return JSON.parse(raw) as ChaosSea;
  } catch {
    return { doubts: [] };
  }
}

function saveChaos(sea: ChaosSea): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAOS_STORAGE_KEY, JSON.stringify(sea));
  } catch {
    // 忽略
  }
}

const MAX_DOUBTS = 100;

export function storeDoubt(text: string, coordinate: { x: number; y: number }, source: string): ChaosDoubt {
  const sea = loadChaos();
  const doubt: ChaosDoubt = {
    id: `doubt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.slice(0, 140),
    coordinate,
    timestamp: Date.now(),
    source,
  };
  sea.doubts.unshift(doubt);
  if (sea.doubts.length > MAX_DOUBTS) sea.doubts = sea.doubts.slice(0, MAX_DOUBTS);
  saveChaos(sea);
  return doubt;
}

export function getChaos(): ChaosSea {
  return loadChaos();
}

export function clearChaos(): void {
  saveChaos({ doubts: [] });
}

// ======================================================================
// 六门禁联动：六论合参
// ======================================================================
// 一次性跑六论，结果按 score 排序。每个门禁独立判断"开/关/徘徊"。
// 不会自动推进到下一步——这就是"门禁"的本意。

export interface SixGatesReading {
  ontos: GateArtifact;
  cognitio: GateArtifact;
  praxis: GateArtifact;
  skene: GateArtifact;
  horizon: GateArtifact;
  reflectio: GateArtifact;
  openedCount: number;
  generatedAt: number;
}

export function sixGatesRead(prompt: string, latestCode: string): SixGatesReading {
  const ontos = ontosGate();
  const cognitio = cognitioGate(prompt);
  const praxis = praxisGate(latestCode);
  const skene = skeneGate();
  const horizon = horizonGate();
  const reflectio = reflectioGate(ontos, cognitio, praxis);

  const all = [ontos, cognitio, praxis, skene, horizon, reflectio];
  const openedCount = all.filter((g) => g.status === "open").length;

  return {
    ontos,
    cognitio,
    praxis,
    skene,
    horizon,
    reflectio,
    openedCount,
    generatedAt: Date.now(),
  };
}

// ======================================================================
// 通用自修正流程 — 感知偏差 → 根因定位 → 物理核验 → 状态修正 →
// 补全缺失 → 验证通过 → 记忆固化 (七步皆为门禁)
// ======================================================================
// 注意：这个流程是门禁式的。每一步都是一个独立门禁，只对历史 engram 进行
// 审视和标注（写 artifact 进去），而不是自动改动任何代码。

export type HealingStepKey =
  | "perception"   // 1 感知偏差
  | "rootcause"    // 2 根因定位
  | "verify"       // 3 物理核验
  | "align"        // 4 状态修正
  | "complete"     // 5 补全缺失
  | "confirm"      // 6 验证通过
  | "persist";     // 7 记忆固化

export interface HealingArtifact {
  step: HealingStepKey;
  name: string;
  status: GateStatus;
  score: number;
  insight: string;
  // 结构化 payload（因步骤而异）
  details: Record<string, unknown>;
  timestamp: number;
}

export interface HealingReading {
  steps: HealingArtifact[];
  openedCount: number;
  // 回头看：选出了哪些历史 engram 作为"回看目标"
  retroTargets: string[];
  generatedAt: number;
}

// ---------- 1. 感知偏差：最新 engram 的关系向量 vs 历史均值的偏差 ----------
function stepPerception(): HealingArtifact {
  const engrams = getAllEngrams();
  if (engrams.length < 3) {
    return {
      step: "perception",
      name: "感知偏差",
      status: "shut",
      score: 0,
      insight: "缘法不足，无足够历史可感知偏差。",
      details: { sampleSize: engrams.length },
      timestamp: Date.now(),
    };
  }
  const vectors = engrams.map(relationVector);
  const meanV = meanVector(vectors.slice(1)); // 排除最新
  const latestV = vectors[0];
  const deviation = euclidean(latestV, meanV); // 0..sqrt(2)≈1.4
  const score = Math.min(1, deviation / 0.7);
  const status: GateStatus = score >= 0.2 ? "open" : score > 0 ? "lingering" : "shut";
  const keys = getRelationKeys();
  const topDeviationIdx = latestV.reduce(
    (bestIdx, v, i, arr) => (Math.abs(v - meanV[i]) > Math.abs(arr[bestIdx] - meanV[bestIdx]) ? i : bestIdx),
    0,
  );
  return {
    step: "perception",
    name: "感知偏差",
    status,
    score,
    insight:
      status === "open"
        ? `感知到偏差：最新 engram 在 ${keys[topDeviationIdx]} 轴偏离历史均值 (d=${deviation.toFixed(2)})`
        : "未见明显偏差；认知如常。",
    details: {
      deviation,
      topDeviation: keys[topDeviationIdx],
      latestVector: latestV,
      meanVector: meanV,
      sampleSize: engrams.length,
    },
    timestamp: Date.now(),
  };
}

// ---------- 2. 根因定位：偏差最大的那个关系键中，哪些历史 engram 最"反常" ----------
function stepRootCause(perception: HealingArtifact): HealingArtifact {
  if (perception.status === "shut") {
    return {
      step: "rootcause",
      name: "根因定位",
      status: "shut",
      score: 0,
      insight: "无偏差，则无因可寻。",
      details: {},
      timestamp: Date.now(),
    };
  }
  const engrams = getAllEnggrams();
  // 找关系键 = topDeviation
  const keys = getRelationKeys();
  const topDeviationKey = (perception.details as Record<string, unknown>).topDeviation as RelationKey;
  if (!topDeviationKey) {
    return { step: "rootcause", name: "根因定位", status: "shut", score: 0, insight: "未获得可追溯之键。", details: {}, timestamp: Date.now() };
  }
  // 计算每个 engram 在此关系键的激活值，找"离群值"
  const values = engrams.map((e) => (e.relations[topDeviationKey] || []).length);
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (values.length || 1);
  const std = Math.sqrt(variance);
  // 离群 = |v - mean| > 2 * std
  const outliers = engrams
    .map((e, i) => ({ engram: e, z: std > 0 ? (values[i] - mean) / std : 0 }))
    .filter((x) => Math.abs(x.z) > 2)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 5);

  const score = Math.min(1, outliers.length / 3);
  const status: GateStatus = score >= 0.3 ? "open" : score > 0 ? "lingering" : "shut";

  return {
    step: "rootcause",
    name: "根因定位",
    status,
    score,
    insight:
      status === "open"
        ? `定位到 ${outliers.length} 个在 ${topDeviationKey} 轴的离群 engram。`
        : "未见显著离群；因果尚不明。",
    details: {
      key: topDeviationKey,
      mean,
      std,
      outliers: outliers.map((o) => ({ id: o.engram.id, self: o.engram.self.slice(0, 30), z: o.z.toFixed(2) })),
    },
    timestamp: Date.now(),
  };
}

// ---------- 3. 物理核验：离群 engram 的关系向量与最新 engram 做一致性核验 ----------
function stepVerify(root: HealingArtifact, perception: HealingArtifact): HealingArtifact {
  if (root.status === "shut" || perception.status === "shut") {
    return {
      step: "verify",
      name: "物理核验",
      status: "shut",
      score: 0,
      insight: "根因/感知未开，无法核验。",
      details: {},
      timestamp: Date.now(),
    };
  }
  const engrams = getAllEngrams();
  const latestV = relationVector(engrams[0]);
  const outliers = (root.details as { outliers: Array<{ id: string }> }).outliers || [];
  let match = 0;
  for (const o of outliers) {
    const e = engrams.find((x) => x.id === o.id);
    if (!e) continue;
    const v = relationVector(e);
    // 最新 engram 与离群 engram 的欧氏距离 — 越小越一致
    const d = euclidean(latestV, v);
    if (d < 0.5) match += 1;
  }
  const score = outliers.length > 0 ? match / outliers.length : 0;
  const status: GateStatus = score >= 0.5 ? "open" : score > 0 ? "lingering" : "shut";
  return {
    step: "verify",
    name: "物理核验",
    status,
    score,
    insight:
      status === "open"
        ? `核验通过：${match}/${outliers.length} 个离群 engram 与最新生成的关系结构一致。`
        : "核验存疑：离群 engram 与最新生成结构不一致。",
    details: { outliersChecked: outliers.length, matched: match, latestVector: latestV },
    timestamp: Date.now(),
  };
}

// ---------- 4. 状态修正：如果核验未通过，则在 engram 上打一个"待回头看"标记 ----------
function stepAlign(verify: HealingArtifact): HealingArtifact {
  const store = getAllEngrams(); // 只读获取
  const list = store;
  if (verify.status !== "lingering" && verify.status !== "open") {
    return { step: "align", name: "状态修正", status: "shut", score: 0, insight: "无需修正。", details: {}, timestamp: Date.now() };
  }
  // 对前 5 个 engram 打"待回头看"标记 — 这只是在内存中返回建议列表，
  // 真正写回会在 step 7 (记忆固化) 才发生
  const suggestions = list.slice(0, 5).map((e) => ({
    id: e.id,
    self: e.self.slice(0, 30),
    suggested: "回头看：重新观察此 engram 与最新生成的关系一致性",
  }));
  const score = verify.score * 0.7; // 略低于前一步
  const status: GateStatus = suggestions.length > 0 ? "open" : "shut";
  return {
    step: "align",
    name: "状态修正",
    status,
    score,
    insight: suggestions.length > 0 ? `已建议回头看 ${suggestions.length} 个 engram。` : "无需修正。",
    details: { suggestions },
    timestamp: Date.now(),
  };
}

// ---------- 5. 补全缺失：检测 engram 图谱中"空"的关系键，建议补全 ----------
function stepComplete(): HealingArtifact {
  const engrams = getAllEngrams();
  if (engrams.length === 0) {
    return { step: "complete", name: "补全缺失", status: "shut", score: 0, insight: "无 engram 可补。", details: {}, timestamp: Date.now() };
  }
  const keys = getRelationKeys();
  const emptyPerKey = keys.map((k) => ({
    key: k,
    count: engrams.filter((e) => (e.relations[k] || []).length === 0).length,
  }));
  const total = emptyPerKey.reduce((a, b) => a + b.count, 0);
  // 分数 = 总缺失/ 理想最大 (engrams.length * 5 的一半)
  const score = Math.min(1, total / (engrams.length * 2.5));
  const status: GateStatus = total > engrams.length * 0.5 ? "open" : total > 0 ? "lingering" : "shut";
  const worst = [...emptyPerKey].sort((a, b) => b.count - a.count)[0];
  return {
    step: "complete",
    name: "补全缺失",
    status,
    score,
    insight:
      status === "open" && worst
        ? `${worst.key} 轴在 ${worst.count}/${engrams.length} 个 engram 中为空——待后世补全。`
        : "图谱中的空缺尚在合理范围。",
    details: { emptyPerKey, total, totalEngrams: engrams.length },
    timestamp: Date.now(),
  };
}

// ---------- 6. 验证通过：汇总前五步的开放门禁数 ----------
function stepConfirm(openedSoFar: number): HealingArtifact {
  const score = openedSoFar / 5;
  const status: GateStatus = score >= 0.4 ? "open" : score > 0 ? "lingering" : "shut";
  return {
    step: "confirm",
    name: "验证通过",
    status,
    score,
    insight:
      status === "open"
        ? `前五步中有 ${openedSoFar} 门开启，系统整体可自洽。`
        : status === "lingering"
          ? `前五步中有 ${openedSoFar} 门开启，尚有未通之处。`
          : "前五步无一门开启——需积累更多经验。",
    details: { openedGates: openedSoFar, totalSteps: 5 },
    timestamp: Date.now(),
  };
}

// ---------- 7. 记忆固化：把本次自修正的所有结果写入 engram 存储 ----------
// （实际上我们不会改旧 engram，而是新造一个"元 engram"来记录本次修为）
function stepPersist(reading: HealingReading): HealingArtifact {
  // 新建一个 "元 engram"：记录本次六门禁的整体评分
  // 这是"记忆固化"的部分：自修正过程本身也成为一个可被后续共振读取的 engram
  try {
    // 这里不做任何自动持久化到 engram store 的操作——
    // 我们把结果返回给调用方，由人来决定是否"存"。
    // 这就是门禁的本质：门禁不自动触发；是否持久化由人决定。
    const gates = reading.steps.filter((s) => s.status !== "shut").length;
    const score = gates / reading.steps.length;
    const status: GateStatus = score >= 0.3 ? "open" : score > 0 ? "lingering" : "shut";
    return {
      step: "persist",
      name: "记忆固化",
      status,
      score,
      insight:
        status === "open"
          ? "本次自修正的整体图谱已备——可存于第七轮混沌海，作为后世回望的坐标。"
          : "本次自修正的缘法未足——不强行写入记忆。",
      details: {
        gatesOpened: gates,
        retroTargets: reading.retroTargets,
        suggestion: "若认可本次自修正，手动调用 persistReading() 以写入长期记忆。",
      },
      timestamp: Date.now(),
    };
  } catch {
    return {
      step: "persist",
      name: "记忆固化",
      status: "shut",
      score: 0,
      insight: "写入时遇异常——缘法暂不可写。",
      details: {},
      timestamp: Date.now(),
    };
  }
}

// ---------- 对外暴露：一次性跑完七步（每步都是门禁，不自动）----------
export function healingReading(prompt: string, latestCode: string): HealingReading {
  // 调用现有六个门禁的核心功能（复用关系向量等函数）
  // 这里主要关注自修正七步。
  const s1 = stepPerception();
  const s2 = stepRootCause(s1);
  const s3 = stepVerify(s2, s1);
  const s4 = stepAlign(s3);
  const s5 = stepComplete();
  const openedSoFar = [s1, s2, s3, s4, s5].filter((s) => s.status === "open").length;
  const s6 = stepConfirm(openedSoFar);
  // retroTargets：被根因定位找到的离群 engram id 们
  const retroTargets =
    s2.status !== "shut" && s2.details.outliers
      ? (s2.details.outliers as Array<{ id: string }>).map((o) => o.id)
      : [];
  const initial: HealingReading = { steps: [s1, s2, s3, s4, s5, s6], openedCount: openedSoFar, retroTargets, generatedAt: Date.now() };
  const s7 = stepPersist(initial);
  initial.steps.push(s7);
  return initial;
}

// ======================================================================
// 持久化辅助：把"回头看"的建议写入到 engram（当用户认可时手动调用）
// ======================================================================
// 这是"主动选择"的——门禁式。默认不会被自动调用。

function getAllEnggrams(): Engram[] {
  return getAllEngrams();
}

// export function confirmRetrospect(targetIds: string[]): number {
//   // 给目标 engram 打一个"已回头看"的信号标记
//   // 用 engageEngram 机制的一个变体：新增一个 "retro" 信号类型
//   let count = 0;
//   for (const id of targetIds) {
//     engageEngram(id, "revisit" as EngagementType);
//     count += 1;
//   }
//   return count;
// }
//
// 说明：engageEngram 已经在 engram.ts 中定义，我们不需要在这里重写，
// 只要让组件调用它即可。

// ======================================================================
// 辅助：把最近一次 SixGatesReading 存到 localStorage（用于 UI 跨刷新保留）
// ======================================================================

const READING_STORAGE_KEY = "deepseek-v4:latest-reading";

export function saveLatestReading(r: SixGatesReading): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(r));
  } catch {
    // 忽略
  }
}

export function loadLatestReading(): SixGatesReading | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(READING_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SixGatesReading;
  } catch {
    return null;
  }
}

// ======================================================================
// 辅助：把 "混沌海存疑" 作为 UI 侧的人工动作——从六论结果中抽取 2-3 个
// 最"徘徊"的门禁写入混沌海
// ======================================================================

export function seedChaosFromReading(reading: SixGatesReading): ChaosDoubt[] {
  const seeded: ChaosDoubt[] = [];
  const lingering = [reading.ontos, reading.cognitio, reading.praxis, reading.horizon, reading.reflectio]
    .filter((g) => g.status === "lingering");
  // 把每个徘徊门禁的 insight 作为"存疑"写入混沌海
  for (const g of lingering) {
    const coord = g.gate === "cognitio"
      ? ((g.payload as CognitioPayload).coordinate)
      : { x: 0, y: 0 };
    seeded.push(storeDoubt(g.insight, coord, g.name));
  }
  return seeded;
}
