// ======================================================================
// 七自修身模块 — Seven Self-Cultivation Gates
// ======================================================================
//
// 出自《道德经》第三十三 & 二十四章：
//
//   知人者，智也；自知者，明也；   → 自知门 (Self-Knowledge)
//   胜人者，有力也；自胜者，强也；   → 自胜门 (Self-Mastery)
//   知足者，富也；                 → 知足门 (Contentment)
//   强行者，有志也；               → 强行 (Perseverance) — 修为分
//   不失其所者，久也；             → 不失其所 (Persistence) — 修为分
//   死而不亡者，寿也；             → 死而不亡 (Immortality) — 修为分
//   知足不辱，知止不殆，可以长久     → 知止门 (Stop Threshold)
//
//   自视者不彰；自见者不明；         → 谦德门 (Humility Gate)
//   自伐者无功；自矜者不长
//
// 核心精神：门禁式。每一步都是独立的"道"的判断，不自动推进。
// 与六论不同，七自关注的是 AI 自身的"修"与"德"——不是对世界的认知，
// 而是对自身生成行为的觉察与约束。
// ======================================================================

import { Engram, getAllEngrams, getRelationKeys, dominantRelation } from "./engram";

// ----------------------------------------------------------------------
// 通用类型
// ----------------------------------------------------------------------

export type CultivationGateStatus = "shut" | "open" | "lingering";

export interface CultivationGate {
  id: string;
  name: string;          // 中文名
  score: number;        // 0..1
  status: CultivationGateStatus;
  insight: string;       // 一行评语（文言感）
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface VirtueScore {
  id: string;
  name: string;
  value: number;         // 绝对值
  normalized: number;    // 0..1
  insight: string;
}

// ======================================================================
// 一、自知门 — "自知者，明也"
// ======================================================================
// 算法：
//   取最新 engram 的 self（自画像），将其与代码实际提取的关系结构做对比
//   - 如果 self 声称的关系与 real relations 高度一致 → 明
//   - 如果 self 声称了很多但实际关系稀疏 → 自视过当
//   - 如果 self 太过简略且关系丰富 → 自抑

export interface SelfKnowledgePayload {
  selfClaimed: string;
  matchedKeys: number;     // self 中描述的关系键在实际代码中命中了几个
  totalRealKeys: number;   // 实际代码中的非空关系键数量
  discrepancy: "congruent" | "overclaim" | "underclaim" | "empty";
  [k: string]: unknown;
}

export function selfKnowledgeGate(threshold = 0.3): CultivationGate {
  const engrams = getAllEngrams();
  if (engrams.length === 0) {
    return {
      id: "self-knowledge", name: "自知门", score: 0, status: "shut",
      insight: "无象可观，无己可知。",
      payload: { selfClaimed: "", matchedKeys: 0, totalRealKeys: 0, discrepancy: "empty" } as SelfKnowledgePayload,
      timestamp: Date.now(),
    };
  }
  const latest = engrams[0];
  const keys = getRelationKeys();
  const realKeys = keys.filter((k) => (latest.relations[k] || []).length > 0);
  const totalRealKeys = realKeys.length;

  // self 文本中看包含哪些关系键的语义关键词
  const selfText = latest.self.toLowerCase();
  const KEY_HINTS: Record<string, string[]> = {
    印: ["support", "依赖", "支撑", "import", "hook", "parent", "wrapping"],
    生: ["output", "renders", "produces", "creates", "渲染", "输出", "生成"],
    比: ["peer", "sibling", "alongside", "同行", "同类", "排列"],
    克: ["constraint", "validates", "limits", "boundary", "约束", "边界", "限制"],
    财: ["consumes", "transforms", "fetches", "mutates", "消耗", "转化", "数据"],
  };
  let matchedKeys = 0;
  for (const k of realKeys) {
    const hints = KEY_HINTS[k] || [];
    if (hints.some((h) => selfText.includes(h))) matchedKeys += 1;
  }

  const matchRate = totalRealKeys > 0 ? matchedKeys / totalRealKeys : 0;
  let discrepancy: SelfKnowledgePayload["discrepancy"] = "congruent";
  if (totalRealKeys === 0) discrepancy = "empty";
  else if (matchRate >= 0.6) discrepancy = "congruent";
  else if (selfText.length > 50 && matchRate < 0.5) discrepancy = "overclaim";
  else discrepancy = "underclaim";

  const score = Math.min(1, matchRate + 0.1);
  const status: CultivationGateStatus = score >= threshold ? "open" : score > 0 ? "lingering" : "shut";

  return {
    id: "self-knowledge", name: "自知门", score, status,
    insight:
      status === "open" ? `自知者明：自画像与实相契合 (${(matchRate * 100).toFixed(0)}%)。`
        : status === "lingering" ? "自画像与实相有隙，明而未彻。"
        : "自观无象，明尚未生。",
    payload: {
      selfClaimed: latest.self.slice(0, 60),
      matchedKeys,
      totalRealKeys,
      discrepancy,
    } as SelfKnowledgePayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 二、自胜门 — "自胜者，强也"
// ======================================================================
// 算法：
//   比较最新 engram 与历史均值的"质量差"——
//   - 关系总数越高 → 结构越完整
//   - 关系熵居中 → 不过度集中也不过度分散
//   - signalScore 越高 → 用户越认可
//   综合计算"自胜度" = 最新 engram 质量分 / 历史均值质量分

export interface SelfMasteryPayload {
  latestQuality: number;    // 0..1
  historicalMean: number;   // 0..1
  selfMasteryIndex: number; // >1 = 胜过历史，<1 = 退步
  trend: "improving" | "declining" | "stable" | "single";
  sampleSize: number;
  [k: string]: unknown;
}

function engramQuality(e: Engram): number {
  const keys = getRelationKeys();
  const counts = keys.map((k) => (e.relations[k] || []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  // 熵：越均匀越好（但不要太均匀）
  const probs = counts.map((c) => c / total);
  let entropy = 0;
  for (const p of probs) {
    if (p > 0.001) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(keys.length);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  const entropyBalance = 1 - Math.abs(normalizedEntropy - 0.55) * 2; // 0.55 熵峰最优
  // 结构分：关系总数 + 信号分
  const structureScore = Math.min(1, total / 15);
  const signalScore = Math.min(1, (e.signalScore || 0) / 10);
  return structureScore * 0.4 + entropyBalance * 0.35 + signalScore * 0.25;
}

export function selfMasteryGate(threshold = 0.2): CultivationGate {
  const engrams = getAllEngrams();
  if (engrams.length < 2) {
    return {
      id: "self-mastery", name: "自胜门", score: 0, status: "shut",
      insight: "独一象，无史可胜。",
      payload: { latestQuality: 0, historicalMean: 0, selfMasteryIndex: 1, trend: "single", sampleSize: 1 } as SelfMasteryPayload,
      timestamp: Date.now(),
    };
  }
  const latestQ = engramQuality(engrams[0]);
  const historicalQs = engrams.slice(1).map(engramQuality);
  const meanQ = historicalQs.reduce((a, b) => a + b, 0) / historicalQs.length;
  const selfMasteryIndex = meanQ > 0 ? latestQ / meanQ : 1;

  let trend: SelfMasteryPayload["trend"] = "stable";
  if (selfMasteryIndex > 1.1) trend = "improving";
  else if (selfMasteryIndex < 0.9) trend = "declining";

  const score = Math.min(1, Math.max(0, (selfMasteryIndex - 0.5) / 1.5));
  const status: CultivationGateStatus = score >= threshold ? "open" : score > 0 ? "lingering" : "shut";

  return {
    id: "self-mastery", name: "自胜门", score, status,
    insight:
      status === "open"
        ? trend === "improving"
          ? `自胜者强：今象胜于往昔 (${(selfMasteryIndex * 100).toFixed(0)}%)。`
          : "自胜者强：今象与往昔相当，稳健持中。"
        : status === "lingering"
          ? "自胜之力未足，修为尚需时日。"
          : "未成史，无胜可论。",
    payload: {
      latestQuality: latestQ,
      historicalMean: meanQ,
      selfMasteryIndex,
      trend,
      sampleSize: engrams.length,
    } as SelfMasteryPayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 三、谦德门 — "自视者不彰；自见者不明；自伐者无功；自矜者不长"
// ======================================================================
// 算法：
//   对最新生成的代码做"谦德"分析——检测四种过度表现的模式：
//   - 炫示 (display): 过多注释解释简单逻辑
//   - 自见 (self-show): 无必要的 console.log / debug 输出
//   - 自伐 (self-praise): 注释中使用了夸大词汇
//   - 自矜 (self-aggrandize): 过度抽象（不必要的函数/组件拆分）
//   综合算出谦德度。

export interface HumilityPayload {
  displayScore: number;       // 炫示分：注释密度
  selfShowScore: number;      // 自见分：调试输出密度
  selfPraiseScore: number;    // 自伐分：夸大词汇命中
  overAbstractionScore: number; // 自矜分：不必要的抽象
  humilityIndex: number;      // 综合谦德度 (0 最谦 = 1)
  pattern: string;            // 主导问题
  [k: string]: unknown;
}

const PRAISE_WORDS = [
  "elegant", "beautiful", "clever", "smart", "brilliant", "perfect",
  "optimal", "best", "excellent", "amazing", "fantastic", "wonderful",
  "优雅", "完美", "最佳", "聪明", "优秀", "很巧", "太棒", "极好",
];

export function humilityGate(code: string, threshold = 0.25): CultivationGate {
  const text = code || "";
  const lines = text.split("\n").length || 1;
  const chars = text.length || 1;

  // 炫示 (display): 注释行数 / 总行数
  const commentLines = text.split("\n").filter((l) =>
    /^\s*\/\/|^\s*\/\*|^\s*\*|^\s*\*\//.test(l.trimStart())
  ).length;
  const displayScore = Math.min(1, commentLines / Math.max(1, lines) * 5);

  // 自见 (self-show): console.log / console.debug / console.warn
  const consoleCalls = (text.match(/console\.(log|debug|warn|info|error|trace)\s*\(/g) || []).length;
  const selfShowScore = Math.min(1, consoleCalls / 5);

  // 自伐 (self-praise): 注释中出现夸大词
  let praiseHits = 0;
  const lower = text.toLowerCase();
  for (const w of PRAISE_WORDS) {
    if (lower.includes(w)) praiseHits += 1;
  }
  const selfPraiseScore = Math.min(1, praiseHits / 4);

  // 自矜 (over-abstraction): 函数数 / 代码行数比过高
  const funcCount = (text.match(/function\s+\w+\s*\(/g) || []).length +
    (text.match(/const\s+\w+\s*=\s*(\([^)]*\)|async\s*\([^)]*\))\s*=>/g) || []).length +
    (text.match(/const\s+\w+\s*=\s*async\s*function/g) || []).length;
  const funcDensity = funcCount / Math.max(1, lines);
  const overAbstractionScore = Math.min(1, funcDensity * 10);

  // 综合谦德度：全零 = 最谦 = 1，全满 = 最不谦 = 0
  const raw = (displayScore + selfShowScore + selfPraiseScore + overAbstractionScore) / 4;
  const humilityIndex = Math.max(0, 1 - raw);

  // 主导问题
  const scores = [
    { key: "炫示", v: displayScore },
    { key: "自见", v: selfShowScore },
    { key: "自伐", v: selfPraiseScore },
    { key: "自矜", v: overAbstractionScore },
  ];
  scores.sort((a, b) => b.v - a.v);
  const pattern = scores[0].v > 0.15 ? scores[0].key : "谦德具足";

  const score = humilityIndex;
  const status: CultivationGateStatus = score >= threshold ? "open" : score > 0.1 ? "lingering" : "shut";

  return {
    id: "humility", name: "谦德门", score, status,
    insight:
      status === "open"
        ? pattern === "谦德具足"
          ? "谦德具足：自视不彰，自见不明，自伐无功，自矜不长。"
          : `谦德有缺：${pattern}尤甚，余食赘行。`
        : "谦德未显，仍需观照。",
    payload: {
      displayScore,
      selfShowScore,
      selfPraiseScore,
      overAbstractionScore,
      humilityIndex,
      pattern,
    } as HumilityPayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 四、知止门 — "知止不殆，可以长久"
// ======================================================================
// 算法：
//   检测生成的代码是否"过度"——
//   - 如果最近 N 个 engram 的代码长度在持续增长但 prompt 复杂度没变 → 可能过度
//   - 如果代码行数远超 prompt 长度 × 经验系数 → 可能过度
//   知止门的 score 越接近 1 表示越"知止"（越知道何时该停）

export interface StopGatePayload {
  codeLength: number;
  promptComplexity: number;
  ratio: number;             // length / complexity
  recentTrend: "expanding" | "contracting" | "stable";
  alert: boolean;            // 需要提醒
  [k: string]: unknown;
}

export function stopGate(prompt: string, code: string, threshold = 0.35): CultivationGate {
  const codeLength = (code || "").length;
  const promptLength = (prompt || "").length || 1;
  // prompt 复杂度用词语数近似
  const promptWords = (prompt || "").split(/\s+/).length;
  const promptComplexity = Math.max(1, promptWords);

  const ratio = codeLength / promptComplexity;
  // 经验系数：每个 prompt 词约产生 50-200 字符的代码
  // 超过 300 可能过度，低于 30 可能不足
  const idealRatio = 80;
  const deviation = Math.abs(ratio - idealRatio) / idealRatio;

  // 最近 trend
  const engrams = getAllEngrams();
  let recentTrend: StopGatePayload["recentTrend"] = "stable";
  if (engrams.length >= 3) {
    const lens = engrams.slice(0, 3).map((e) => e.relations ? Object.values(e.relations).reduce((a, v) => a + (v || []).length, 0) : 0);
    if (lens[0] > lens[1] + 2 && lens[1] > lens[2] + 2) recentTrend = "expanding";
    else if (lens[0] < lens[1] - 2 && lens[1] < lens[2] - 2) recentTrend = "contracting";
  }

  const alert = ratio > 300 || recentTrend === "expanding";
  const score = Math.max(0, 1 - deviation); // 偏离越小，知止度越高

  const status: CultivationGateStatus = score >= threshold ? "open" : score > 0.15 ? "lingering" : "shut";

  return {
    id: "stop", name: "知止门", score, status,
    insight:
      status === "open"
        ? "知止不殆：生成适度，无过不及。"
        : status === "lingering"
          ? alert
            ? "生成有膨胀之势——知止者不殆。"
            : "生成略偏，尚可守中。"
          : "不知止，则殆。",
    payload: {
      codeLength,
      promptComplexity,
      ratio,
      recentTrend,
      alert,
    } as StopGatePayload,
    timestamp: Date.now(),
  };
}

// ======================================================================
// 三项修为分 — 强行 / 不失其所 / 死而不亡
// ======================================================================
// 这些不是门禁，而是持续累积的"德行"指标。

// 强行 (Perseverance)：用户重复生成同一风格主题的次数
// 从 engram 的 self 文本相似度来衡量
export function perseveranceScore(): VirtueScore {
  const engrams = getAllEngrams();
  if (engrams.length < 2) {
    return {
      id: "perseverance", name: "强行", value: 0, normalized: 0,
      insight: "尚未有行，何论强行。",
    };
  }
  // 检测 self 的前缀相似度（如 "A React component" vs "A React hook"）
  let samePrefix = 0;
  for (let i = 1; i < engrams.length; i++) {
    const prev = engrams[i].self.slice(0, 20);
    const curr = engrams[i - 1].self.slice(0, 20);
    let match = 0;
    for (let j = 0; j < Math.min(prev.length, curr.length); j++) {
      if (prev[j] === curr[j]) match += 1; else break;
    }
    if (match >= 8) samePrefix += 1;
  }
  const value = samePrefix;
  const normalized = Math.min(1, value / 5);
  return {
    id: "perseverance", name: "强行", value, normalized,
    insight:
      normalized >= 0.6
        ? "强行者有志：持续精进，念念不忘。"
        : normalized >= 0.3
          ? "强行渐显，志向初立。"
          : "强行未著，变易无常。",
  };
}

// 不失其所 (Persistence)：engram 存储健康度
export function persistenceScore(): VirtueScore {
  const engrams = getAllEngrams();
  if (engrams.length === 0) {
    return {
      id: "persistence", name: "不失其所", value: 0, normalized: 0,
      insight: "无其所，何谈不失。",
    };
  }
  // 健康度 = 1 - (空关系键比例)
  const keys = getRelationKeys();
  let totalEmpty = 0;
  for (const e of engrams) {
    for (const k of keys) {
      if ((e.relations[k] || []).length === 0) totalEmpty += 1;
    }
  }
  const maxEmpty = engrams.length * keys.length;
  const emptyRate = maxEmpty > 0 ? totalEmpty / maxEmpty : 0;
  const normalized = Math.max(0, 1 - emptyRate);
  return {
    id: "persistence", name: "不失其所", value: engrams.length, normalized,
    insight:
      normalized >= 0.8
        ? "不失其所者久：记忆图谱紧密，根基稳固。"
        : normalized >= 0.5
          ? "其所尚在，但有空隙。"
          : "其所渐失，根基动摇。",
  };
}

// 死而不亡 (Immortality)：跨时间 engram 的共振持久度
export function immortalityScore(): VirtueScore {
  const engrams = getAllEngrams();
  if (engrams.length < 3) {
    return {
      id: "immortality", name: "死而不亡", value: 0, normalized: 0,
      insight: "生而未久，无死可论。",
    };
  }
  // 最老的那个 engram 的信号分（如果有的话）——意味着它被"记住"了
  const oldest = engrams[engrams.length - 1];
  const newest = engrams[0];
  const timeSpan = newest.timestamp - oldest.timestamp;
  const hoursAlive = Math.max(0.01, timeSpan / (1000 * 60 * 60));
  // 信号分 + 时间跨度
  const signalScore = engrams.reduce((a, e) => a + (e.signalScore || 0), 0);
  const normalized = Math.min(1, signalScore / (10 + hoursAlive * 0.5));
  return {
    id: "immortality", name: "死而不亡", value: signalScore, normalized,
    insight:
      normalized >= 0.5
        ? "死而不亡者寿：精魂入记忆，不朽于时光。"
        : normalized >= 0.2
          ? "略有回响，但寿未长久。"
          : "未有不亡，速朽如朝露。",
  };
}

// ======================================================================
// 修身合参：一次性跑完四门 + 三德
// ======================================================================

export interface SelfCultivationReading {
  gates: CultivationGate[];
  virtues: VirtueScore[];
  openedCount: number;
  generatedAt: number;
}

export function selfCultivationRead(prompt: string, latestCode: string): SelfCultivationReading {
  const gates: CultivationGate[] = [
    selfKnowledgeGate(),
    selfMasteryGate(),
    humilityGate(latestCode),
    stopGate(prompt, latestCode),
  ];
  const virtues: VirtueScore[] = [
    perseveranceScore(),
    persistenceScore(),
    immortalityScore(),
  ];
  const openedCount = gates.filter((g) => g.status === "open").length;
  return {
    gates,
    virtues,
    openedCount,
    generatedAt: Date.now(),
  };
}

// ======================================================================
// 辅助：localStorage 持久化
// ======================================================================

const CULTIVATION_STORAGE_KEY = "deepseek-v4:latest-cultivation";

export function saveLatestCultivation(r: SelfCultivationReading): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CULTIVATION_STORAGE_KEY, JSON.stringify(r));
  } catch { /* ignore */ }
}

export function loadLatestCultivation(): SelfCultivationReading | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CULTIVATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelfCultivationReading;
  } catch { return null; }
}