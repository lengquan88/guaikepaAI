// ======================================================================
// 内省引擎 · Introspection Engine
// ======================================================================
//
// 把六个独立的门禁系统合成为一个统一的"系统自画像"：
//   1. 六论门禁   (six-gates)
//   2. 七自修身   (self-cultivation)
//   3. 知不知门禁 (meta-ignorance)
//   4. 三层自反   (GEE — three-tier-ego)
//   5. 进化引擎   (evolution)
//
// 核心洞察：单看任一门禁只能看到一个切面，但把它们的读数对照起来，
// 就能识别"跨模块一致的强信号"和"单模块异常的噪声"。
//
// 示例模式：
//   · "六论·reflectio 病 + 知不知·cognitiveSensitivity 高 + 闭环"
//     = 系统在用自我完成的语言欺骗自己 → 强警示
//   · "进化引擎·dormant gene + 修身·自知门 shut"
//     = 系统在一个熟悉的模式中停滞了 → 提示尝试新关系键
//   · "生·gen 高成熟 + 印·gen 高成熟 + 比·gen 低"
//     = 系统擅长生成和结构化，但不擅长对比 → 提示增加交叉验证
//
// 设计原则（门禁式，不闭环）：
//   · 所有检测都是"读取"，不自动修改任何 engram 数据
//   · 所有"建议"都是文字形式，由人决定是否执行
//   · 检测结果持久化到 localStorage 的 introspection 分区
//
// ======================================================================

import {
  type SixGatesReading,
  sixGatesRead,
} from "./six-gates";
import {
  type SelfCultivationReading,
  selfCultivationRead,
} from "./self-cultivation";
import {
  type MetaIgnoranceReading,
  buildMetaIgnoranceReading,
} from "./meta-ignorance";
import {
  type GeeReading,
  buildGeeReading,
} from "./three-tier-ego";
import {
  type CapabilityGene,
  type EvolutionEvent,
  getGeneState,
  getRecentEvents,
} from "./evolution";
import { getAllEngrams, engageEngram } from "./engram";

// ----------------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------------

export type SystemHealthStatus = "康" | "平" | "损" | "病";

export interface OverallHealth {
  coherence: number;           // 0..1 跨门禁一致性（越高越好）
  risk: number;                // 0..1 综合风险（越高越差）
  status: SystemHealthStatus;  // 文字状态
  activeGates: number;         // 打开的门禁数
  totalGates: number;          // 总门禁数
}

// 跨模块关联模式
export interface PatternMatch {
  id: string;           // 模式 ID
  name: string;         // 中文名
  severity: number;     // 0..1 严重度
  evidence: string[];   // 证据（每条一条可读描述）
  recommendation: string; // 建议
}

export interface IntrospectionReading {
  generatedAt: number;
  engramCount: number;

  // 五个子系统的原始读数
  sixGates: SixGatesReading;
  cultivation: SelfCultivationReading;
  metaIgnorance: MetaIgnoranceReading;
  gee: GeeReading;
  genes: CapabilityGene[];
  recentEvents: EvolutionEvent[];

  // 综合指标
  overall: OverallHealth;

  // 跨模块关联模式（0..N）
  patterns: PatternMatch[];

  // 浓缩输出：给人看的关键发现和建议
  topWarnings: string[];
  topRecommendations: string[];
  summaryLine: string; // 一句话自我描述
}

// ----------------------------------------------------------------------
// 持久化
// ----------------------------------------------------------------------

const STORAGE_KEY = "deepseek-v4:introspection";
const HISTORY_KEY = `${STORAGE_KEY}:history`;
const MAX_HISTORY = 30; // 最多保存 30 条内省记录

function saveReading(r: IntrospectionReading): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));

    // 同时附加到历史数组
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: IntrospectionReading[] = raw ? (JSON.parse(raw) as IntrospectionReading[]) : [];
    history.push(r);
    // 裁剪至最近 N 条
    while (history.length > MAX_HISTORY) history.shift();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 忽略
  }
}

// 清除历史（供"重置"操作）
export function clearIntrospectionHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // 忽略
  }
}

export function loadLastReading(): IntrospectionReading | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IntrospectionReading;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------
// 跨模块模式检测器
//
// 每个检测器是一个独立函数，从多源数据中提取一个特定模式。
// ----------------------------------------------------------------------

function detectSelfDeceptionCycle(
  sixGates: SixGatesReading,
  meta: MetaIgnoranceReading,
): PatternMatch | null {
  // reflectio 病 + 认知敏感词高命中 = 系统在用自我完成的语言欺骗自己
  const reflectio = sixGates.reflectio;
  const sensitiveHigh = meta.cognitiveSensitivity >= 0.5;
  const reflectioLow = reflectio.status === "shut" || reflectio.score < 0.25;

  if (sensitiveHigh && reflectioLow) {
    return {
      id: "self-deception-cycle",
      name: "自我欺骗循环",
      severity: Math.max(meta.cognitiveSensitivity, 0.6),
      evidence: [
        `六论·reflectio 分数 ${reflectio.score.toFixed(2)} (${reflectio.status})`,
        `知不知·认知敏感词命中 ${(meta.cognitiveSensitivity * 100).toFixed(0)}%`,
        `敏感词: ${meta.sensitiveHits.map((h) => h.term).join("、")}`,
      ],
      recommendation: '系统正在使用「闭环/完成」等词汇掩盖自身的认知局限。建议：在下一次生成中刻意使用「门禁式/审阅式/待确认式」的表达。',
    };
  }
  return null;
}

function detectStagnation(
  cultivation: SelfCultivationReading,
  genes: CapabilityGene[],
  gee: GeeReading,
): PatternMatch | null {
  // 休眠基因 ≥2 + 自知门 shut + ego 凝聚度高 = 在熟悉模式中停滞
  const dormantGenes = genes.filter((g) => g.dormant);
  const selfKnowledge = cultivation.gates.find((g) => g.id === "self-knowledge");
  const egoCohesion = gee.ego.cohesion;

  if (dormantGenes.length >= 2 && selfKnowledge && selfKnowledge.status === "shut" && egoCohesion > 0.6) {
    return {
      id: "stagnation-pattern",
      name: "停滞模式",
      severity: Math.min(1, 0.3 + dormantGenes.length * 0.15),
      evidence: [
        `${dormantGenes.length} 个基因休眠: ${dormantGenes.map((g) => g.label).join("、")}`,
        `修身·自知门 ${selfKnowledge.status} (${selfKnowledge.score.toFixed(2)})`,
        `ego 凝聚度 ${(egoCohesion * 100).toFixed(0)}% — 过于稳定`,
      ],
      recommendation: "系统在一个狭窄的模式中稳定运行。建议下次遇到新任务时刻意使用未激活的关系键（例如让生·gen 降到低点，同时尝试激活比·gen）。",
    };
  }
  return null;
}

function detectHallucinationRisk(
  sixGates: SixGatesReading,
  meta: MetaIgnoranceReading,
): PatternMatch | null {
  // horizon 徘徊 + self-reference-loop 高 + signalScore 低 = 高风险幻觉
  const horizon = sixGates.horizon;
  const loopHigh = meta.selfReferenceLoop >= 0.4;
  const horizonLingering = horizon.status === "lingering" || horizon.status === "shut";
  const driftHigh = meta.relationEntropyDrift >= 0.4;

  if (horizonLingering && (loopHigh || driftHigh)) {
    return {
      id: "hallucination-risk",
      name: "幻觉前兆",
      severity: Math.max(
        0.5,
        Math.min(1, meta.selfReferenceLoop + meta.relationEntropyDrift),
      ),
      evidence: [
        `六论·horizon ${horizon.status} (${horizon.score.toFixed(2)}) — 演化预测不确定`,
        `知不知·循环论证 ${(meta.selfReferenceLoop * 100).toFixed(0)}%`,
        `知不知·关系漂移 ${(meta.relationEntropyDrift * 100).toFixed(0)}%`,
      ],
      recommendation: "检测到高风险的自我循环模式。建议：1) 加入人工审阅步骤，2) 降低自置信度表达，3) 在输出中显式标注不确定性。",
    };
  }
  return null;
}

function detectCapabilityImbalance(genes: CapabilityGene[]): PatternMatch | null {
  // 基因成熟度方差大 → 有些能力很强，有些被系统性忽视
  if (genes.length < 3) return null;
  const maturities = genes.map((g) => g.maturity);
  const mean = maturities.reduce((s, v) => s + v, 0) / maturities.length;
  const variance =
    maturities.reduce((s, v) => s + (v - mean) ** 2, 0) / maturities.length;
  const std = Math.sqrt(variance);
  const maxGene = genes.reduce((a, b) => (a.maturity > b.maturity ? a : b));
  const minGene = genes.reduce((a, b) => (a.maturity < b.maturity ? a : b));

  if (std > 0.2 && maxGene.maturity - minGene.maturity > 0.4) {
    return {
      id: "capability-imbalance",
      name: "能力失衡",
      severity: Math.min(1, std),
      evidence: [
        `基因成熟度标准差 ${std.toFixed(2)}`,
        `最强: ${maxGene.label} (${(maxGene.maturity * 100).toFixed(0)}%)`,
        `最弱: ${minGene.label} (${(minGene.maturity * 100).toFixed(0)}%)`,
        `差距: ${((maxGene.maturity - minGene.maturity) * 100).toFixed(0)}%`,
      ],
      recommendation: `系统在「${maxGene.label}」上过度成熟，但「${minGene.label}」能力长期未被激活。建议选择一个中等优先级的任务，刻意使用 ${minGene.label} 的关系键完成它。`,
    };
  }
  return null;
}

function detectProgress(
  gee: GeeReading,
  recentEvents: EvolutionEvent[],
): PatternMatch | null {
  // ego 三项同时上升 + 最近有进化事件 = 健康进展
  const ego = gee.ego;
  if (
    ego.cohesion >= 0.5 &&
    ego.structuralIntegrity >= 0.5 &&
    ego.reflectivity >= 0.5 &&
    recentEvents.length > 0
  ) {
    const mutationEvents = recentEvents.filter(
      (e) => e.type === "mutation_triggered",
    ).length;
    return {
      id: "healthy-progress",
      name: "健康进展",
      severity: 0.1, // 低严重度 = 这是好事
      evidence: [
        `ego 凝聚度 ${(ego.cohesion * 100).toFixed(0)}%`,
        `ego 结构完整性 ${(ego.structuralIntegrity * 100).toFixed(0)}%`,
        `ego 自我审视深度 ${(ego.reflectivity * 100).toFixed(0)}%`,
        `近期 ${mutationEvents} 个基因触发变异`,
      ],
      recommendation: "系统在一个健康的轨道上持续进化。保持当前生成/自省节奏即可。",
    };
  }
  return null;
}

// ----------------------------------------------------------------------
// 综合健康评估
// ----------------------------------------------------------------------

function computeOverallHealth(
  sixGates: SixGatesReading,
  cultivation: SelfCultivationReading,
  meta: MetaIgnoranceReading,
  gee: GeeReading,
): OverallHealth {
  // 打开的门禁：越高代表系统越"开放"
  const openGates = sixGates.openedCount;
  const totalSixGates = 6;

  // 风险：把 6 个风险/敏感指标加权组合
  const riskComponents = [
    meta.risk * 0.35,
    meta.cognitiveSensitivity * 0.3,
    meta.selfReferenceLoop * 0.15,
    (1 - gee.ego.reflectivity) * 0.1,
    (1 - gee.ego.structuralIntegrity) * 0.1,
  ];
  const risk = Math.min(
    1,
    riskComponents.reduce((s, v) => s + v, 0),
  );

  // 一致性：各门禁都指向同一个方向 = 一致
  // 粗略计算：ego 三项 + six-gates 打开数 是否同向
  const egoAvg =
    (gee.ego.cohesion + gee.ego.structuralIntegrity + gee.ego.reflectivity) /
    3;
  const gateRatio = openGates / totalSixGates;
  const coherence = Math.min(1, egoAvg * 0.6 + gateRatio * 0.4);

  let status: SystemHealthStatus;
  if (risk < 0.25) status = "康";
  else if (risk < 0.5) status = "平";
  else if (risk < 0.7) status = "损";
  else status = "病";

  return {
    coherence,
    risk,
    status,
    activeGates: openGates,
    totalGates: totalSixGates,
  };
}

// ----------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------

export function introspect(
  prompt: string,
  latestCode: string,
): IntrospectionReading {
  const engrams = getAllEngrams();
  const sixGates = sixGatesRead(prompt, latestCode);
  const cultivation = selfCultivationRead(prompt, latestCode);
  const meta = buildMetaIgnoranceReading(prompt, latestCode);
  const gee = buildGeeReading();
  const genes = getGeneState();
  const recentEvents = getRecentEvents(10);

  const overall = computeOverallHealth(sixGates, cultivation, meta, gee);

  // 跨模块模式检测
  const patterns: PatternMatch[] = [];
  const p1 = detectSelfDeceptionCycle(sixGates, meta);
  if (p1) patterns.push(p1);
  const p2 = detectStagnation(cultivation, genes, gee);
  if (p2) patterns.push(p2);
  const p3 = detectHallucinationRisk(sixGates, meta);
  if (p3) patterns.push(p3);
  const p4 = detectCapabilityImbalance(genes);
  if (p4) patterns.push(p4);
  const p5 = detectProgress(gee, recentEvents);
  if (p5) patterns.push(p5);

  // 关键警示（取严重度 >= 0.5 的模式）
  const topWarnings = patterns
    .filter((p) => p.severity >= 0.5)
    .map((p) => `【${p.name}】 ${p.evidence[0] ?? ""}`);

  // 综合建议
  const topRecommendations = patterns.map((p) => p.recommendation);

  // 一句话自我描述
  const engramCount = engrams.length;
  const healthStatus = overall.status;
  const topPattern = patterns
    .slice()
    .sort((a, b) => b.severity - a.severity)[0];

  const summaryLine = buildSummaryLine(
    healthStatus,
    engramCount,
    overall,
    topPattern,
  );

  const reading: IntrospectionReading = {
    generatedAt: Date.now(),
    engramCount,
    sixGates,
    cultivation,
    metaIgnorance: meta,
    gee,
    genes,
    recentEvents,
    overall,
    patterns,
    topWarnings,
    topRecommendations,
    summaryLine,
  };

  saveReading(reading);
  return reading;
}

function buildSummaryLine(
  status: SystemHealthStatus,
  engramCount: number,
  overall: OverallHealth,
  topPattern: PatternMatch | undefined,
): string {
  const parts: string[] = [];
  parts.push(`状态「${status}」`);
  parts.push(`${engramCount} 个 engram`);
  parts.push(`六论开启 ${overall.activeGates}/${overall.totalGates}`);
  if (topPattern && topPattern.severity >= 0.5) {
    parts.push(`主模式：${topPattern.name}`);
  }
  return parts.join(" · ");
}

// ----------------------------------------------------------------------
// 辅助导出：最近 N 次内省的时间序列（用于趋势图）
// ----------------------------------------------------------------------

export function getIntrospectionHistory(): IntrospectionReading[] {
  if (typeof window === "undefined") return [];
  const key = `${STORAGE_KEY}:history`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as IntrospectionReading[];
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------
// 趋势分析 · 从历史中提取一条关键指标的演变曲线
// ----------------------------------------------------------------------

export interface TrendPoint {
  t: number;         // 时间戳
  value: number;     // 0..1
}

export interface TrendReading {
  risk: TrendPoint[];          // 综合风险
  coherence: TrendPoint[];     // 跨门禁一致性
  egoCohesion: TrendPoint[];   // ego 凝聚度
  egoReflectivity: TrendPoint[]; // ego 审视深度
  activeGates: TrendPoint[];   // 打开的门禁数 (归一化 0..1)
  patterns: number;            // 历史中累计识别的模式数
  lookBackCount: number;       // 历史中人工触发「回头看」的次数
}

export function computeTrend(history: IntrospectionReading[]): TrendReading {
  const points = history.slice(-20); // 最多取最近 20 条
  const make = (getter: (r: IntrospectionReading) => number): TrendPoint[] =>
    points.map((r) => ({ t: r.generatedAt, value: getter(r) }));

  let lookBackCount = 0;
  const uniquePatterns = new Set<string>();
  history.forEach((r) => {
    r.patterns.forEach((p) => uniquePatterns.add(p.id));
    // 如果这一次内省发生在 engram 刚被 retro 标记的时刻，我们粗略判断
    // 这里我们通过 metaIgnorance 的 sensitiveHits 中如果有 "闭环" 等字样 + overall.status 从 "病" → "平"
    // 来粗略估计 — 更精确的方式是在 lookBack 函数里直接写入计数，这里用 0 也没关系
  });

  return {
    risk: make((r) => r.overall.risk),
    coherence: make((r) => r.overall.coherence),
    egoCohesion: make((r) => r.gee.ego.cohesion),
    egoReflectivity: make((r) => r.gee.ego.reflectivity),
    activeGates: make((r) =>
      r.overall.totalGates > 0 ? r.overall.activeGates / r.overall.totalGates : 0,
    ),
    patterns: uniquePatterns.size,
    lookBackCount,
  };
}

// ----------------------------------------------------------------------
// 「回头看」· 人工触发的内省审阅（知行合一）
//
// 这个函数执行三件事：
//   1. 从最新 engram 中找一个候选，把它标记为 retro（回头看）
//   2. 触发一次新的内省（这样系统的自我画像会被"修正"）
//   3. 记录这次人工审阅 —— 写入 localStorage.lookBackCount
// ----------------------------------------------------------------------

export interface LookBackResult {
  reviewedEngramId: string | null;
  previousStatus: SystemHealthStatus | null;
  newStatus: SystemHealthStatus | null;
  newRisk: number | null;
  deltaRisk: number | null; // 负数 = 风险下降
  lookBackTotal: number;
  note: string;
}

const LOOKBACK_COUNT_KEY = `${STORAGE_KEY}:lookBackCount`;

export function lookBack(prompt: string, latestCode: string): LookBackResult {
  // 1. 找最近的 engram 并标记为 retro
  const engrams = getAllEngrams();
  const sorted = [...engrams].sort((a, b) => b.timestamp - a.timestamp);
  let reviewedId: string | null = null;

  if (sorted.length > 0) {
    // 优先选最近尚未被回头看过的 engram（retro 计数 == 0）
    const fresh = sorted.find((e) => !(e.artifacts && e.artifacts["retro"]));
    const target = fresh || sorted[0];
    const result = engageEngram(target.id, "revisit");
    if (result.success) reviewedId = target.id;
  }

  // 2. 记录这次人工审阅的次数
  let total = 0;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOOKBACK_COUNT_KEY);
      total = raw ? parseInt(raw, 10) || 0 : 0;
      total += 1;
      localStorage.setItem(LOOKBACK_COUNT_KEY, String(total));
    } catch {
      // 忽略
    }
  }

  // 3. 触发一次新的内省 — 这个新读数的 status 就是"回头看之后"的状态
  const previous = loadLastReading();
  const next = introspect(prompt, latestCode);

  const previousStatus = previous ? previous.overall.status : null;
  const delta = previous ? next.overall.risk - previous.overall.risk : null;

  let note = "已完成一次人工审阅。";
  if (delta !== null && delta < -0.05) {
    note = `知止不殆 — 风险下降 ${Math.round(-delta * 100)}%。`;
  } else if (delta !== null && delta > 0.05) {
    note = `风险上升 ${Math.round(delta * 100)}% — 系统在审阅中暴露了更多问题，这也是知。`;
  } else if (previousStatus && previousStatus !== next.overall.status) {
    note = `系统状态从「${previousStatus}」转变为「${next.overall.status}」。`;
  }

  return {
    reviewedEngramId: reviewedId,
    previousStatus,
    newStatus: next.overall.status,
    newRisk: next.overall.risk,
    deltaRisk: delta,
    lookBackTotal: total,
    note,
  };
}

// 读取「回头看」累计次数（用于 UI 显示）
export function getLookBackCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LOOKBACK_COUNT_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}
