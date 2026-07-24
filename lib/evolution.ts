// ======================================================================
// 能力基因进化引擎 (Gene Evolution Engine)
//
// 思想来源：
//   老子"为道日损，损之又损，以至于无为"——能力基因不是"添加更多"，而是
//   在实践中不断提炼，淘汰无效的关联，形成更精炼的能力结构。
//
//   《易经》"穷则变，变则通，通则久"——当基因达到成熟上限，需要"变异"
//   才能继续进化；长期不激活的基因会进入"休眠"状态，直至被重新唤醒或退场。
//
// 进化机制（门禁驱动，不自动修改）：
//   1. 激活检测：每次 engram 生成后，检测哪些基因被激活（基于关系键匹配）
//   2. 成熟度更新：使用指数加权移动平均（EWMA），老数据逐渐衰减
//   3. 休眠检测：连续 N 个 engram 周期未激活 → 休眠警告
//   4. 变异阈值：成熟度突破 0.85 时触发变异评估，产出"基因进化建议"
//   5. 干预输出：所有状态变化都生成可读的干预指令，人类确认后才执行
//
// 设计原则（门禁式）：
//   - 不自动提升或修改任何基因数据
//   - 所有"进化"都表现为"建议"和"警告"，等待人类确认
//   - 变异事件记入事件日志（events），可追溯、可审计
//
// ======================================================================

import { getAllEngrams, RelationKey } from "./engram";

// ----------------------------------------------------------------------
// 基因定义（能力基因）
// ----------------------------------------------------------------------
//
// 每个基因代表一个相对稳定的代码能力轴。
// 成熟度不靠外部评分，而靠"在实践中被激活的频率"来驱动。
// 这对应老子的"强行者有志"——持续在实践中激活的能力，自然会成熟。

export interface CapabilityGene {
  id: string;           // 唯一标识
  label: string;        // 中文标签
  description: string;  // 一句话描述
  /** 主导关系键 — 这个基因最常与哪种关系键共现 */
  dominantRelation: RelationKey;
  /** 次要关系键 */
  secondaryRelations: RelationKey[];
  /** 成熟度 0..1 */
  maturity: number;
  /** 是否处于休眠状态（长期未被激活） */
  dormant: boolean;
  /** 最后激活时间戳 */
  lastActivated: number;
  /** 累计激活次数 */
  activationCount: number;
  /** 成熟度历史（用于可视化曲线） */
  history: Array<{ timestamp: number; maturity: number }>;
}

export interface EvolutionEvent {
  id: string;
  timestamp: number;
  type: "activation" | "dormancy_warning" | "mutation_triggered" | "resurrection" | "reset";
  geneId: string;
  geneLabel: string;
  before: number;       // 变异前成熟度
  after: number;       // 变异后成熟度（或警告级别）
  note: string;
}

// ----------------------------------------------------------------------
// 基因库（内存中，每次会话从 localStorage 恢复）
// ----------------------------------------------------------------------

const GENE_DEFINITIONS: Omit<CapabilityGene, "maturity" | "dormant" | "lastActivated" | "activationCount" | "history">[] = [
  {
    id: "印-结构化",
    label: "印 · 结构化思维",
    description: "擅长提取模式、定义类型、构建层次清晰的结构",
    dominantRelation: "印",
    secondaryRelations: ["比", "克"],
  },
  {
    id: "生-生成",
    label: "生 · 生成能力",
    description: "擅长代码生成、补全、模板填充、多路并行生成",
    dominantRelation: "生",
    secondaryRelations: ["印", "财"],
  },
  {
    id: "比-对比",
    label: "比 · 对比分析",
    description: "擅长比较选项、权衡利弊、多方案并列展示",
    dominantRelation: "比",
    secondaryRelations: ["克", "印"],
  },
  {
    id: "克-批判",
    label: "克 · 批判审查",
    description: "擅长发现漏洞、检测错误、提出质疑和反驳",
    dominantRelation: "克",
    secondaryRelations: ["比", "财"],
  },
  {
    id: "财-资源整合",
    label: "财 · 资源整合",
    description: "擅长引入外部库、整合API、拼接异构模块",
    dominantRelation: "财",
    secondaryRelations: ["生", "比"],
  },
  {
    id: "共振-自省",
    label: "共振 · 元认知自省",
    description: "擅长识别自身局限、检测自诱导模式、提出回头看建议",
    dominantRelation: "印",
    secondaryRelations: ["克"],
  },
  {
    id: "进化-适应",
    label: "进化 · 适应调整",
    description: "擅长从失败中学习、调整策略、适应新约束",
    dominantRelation: "生",
    secondaryRelations: ["比", "印"],
  },
];

const STORAGE_KEY = "deepseek-v4:gene-evolution";
const DORMANCY_THRESHOLD = 8; // 连续 8 个 engram 周期未激活 → 休眠警告
const MUTATION_THRESHOLD = 0.85; // 成熟度 > 0.85 → 可触发变异
const DECAY_FACTOR = 0.92; // 每次未激活时的衰减系数

// ----------------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------------

function loadGenes(): CapabilityGene[] {
  if (typeof window === "undefined") return initGenes();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initGenes();
    const parsed = JSON.parse(raw) as CapabilityGene[];
    // 验证结构完整性
    return parsed.length === GENE_DEFINITIONS.length ? parsed : initGenes();
  } catch {
    return initGenes();
  }
}

function initGenes(): CapabilityGene[] {
  return GENE_DEFINITIONS.map((def) => ({
    ...def,
    maturity: 0.1, // 新基因从 0.1 开始，不是 0 — 避免"零起点"幻觉
    dormant: false,
    lastActivated: Date.now(),
    activationCount: 0,
    history: [{ timestamp: Date.now(), maturity: 0.1 }],
  }));
}

function saveGenes(genes: CapabilityGene[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(genes));
  } catch {
    // 忽略存储失败
  }
}

function isActivatedByEngram(
  gene: CapabilityGene,
  relations: Partial<Record<RelationKey, string[]>>,
): boolean {
  // 基因被激活的条件：
  // 主导关系键有内容 OR 任意次要关系键有内容
  const domArr = relations[gene.dominantRelation];
  if (domArr && domArr.length > 0) return true;
  for (const k of gene.secondaryRelations) {
    const arr = relations[k];
    if (arr && arr.length > 0) return true;
  }
  return false;
}

// ----------------------------------------------------------------------
// 核心算法
// ----------------------------------------------------------------------

export interface EvolutionResult {
  genes: CapabilityGene[];
  /** 本轮新产生的进化事件 */
  events: EvolutionEvent[];
  /** 给人类的干预建议 */
  interventions: Intervention[];
  /** 系统整体成熟度（所有基因成熟度的平均值） */
  overallMaturity: number;
  /** 休眠基因列表 */
  dormantGenes: string[];
  /** 接近变异的基因（成熟度 > 0.7） */
  nearMutationGenes: string[];
  generatedAt: number;
}

export interface Intervention {
  type: "dormancy_warning" | "mutation_opportunity" | "imbalance_alert" | "strengthen_reminder";
  geneId: string;
  geneLabel: string;
  message: string;
  urgency: "low" | "medium" | "high";
  timestamp: number;
}

/**
 * 主入口：每生成一次代码后，调用此函数驱动基因进化。
 *
 * @param relations - 当前 engram 的关系图谱
 * @param selfDescription - 当前 engram 的 self 描述
 * @returns 进化结果（含事件、干预建议、基因状态）
 */
export function evolveGenes(
  relations: Partial<Record<RelationKey, string[]>>,
  selfDescription: string,
): EvolutionResult {
  const genes = loadGenes();
  const allEngrams = getAllEngrams();
  const totalEngrams = allEngrams.length;
  const events: EvolutionEvent[] = [];
  const interventions: Intervention[] = [];

  const now = Date.now();

  // 1. 激活检测 + 成熟度更新
  for (const gene of genes) {
    const wasActive = !gene.dormant;
    const activated = isActivatedByEngram(gene, relations);

    if (activated) {
      // 激活：成熟度 EWMA 更新
      // 旧值衰减，新值向 1.0 收敛
      const delta = (1.0 - gene.maturity) * 0.18; // 每次激活提升 18% 的剩余空间
      gene.maturity = Math.min(1, gene.maturity + delta);
      gene.lastActivated = now;
      gene.activationCount += 1;
      gene.dormant = false;

      // 记录历史（只保留最近 20 个点）
      gene.history.push({ timestamp: now, maturity: gene.maturity });
      if (gene.history.length > 20) gene.history.shift();

      if (!wasActive) {
        // 从休眠中苏醒
        events.push({
          id: `evt-${now}-${gene.id}`,
          timestamp: now,
          type: "resurrection",
          geneId: gene.id,
          geneLabel: gene.label,
          before: 0,
          after: gene.maturity,
          note: `基因「${gene.label}」从休眠中苏醒，成熟度恢复至 ${(gene.maturity * 100).toFixed(0)}%`,
        });
      } else if (gene.maturity >= MUTATION_THRESHOLD && gene.history[gene.history.length - 2]?.maturity < MUTATION_THRESHOLD) {
        // 跨越变异阈值
        events.push({
          id: `evt-${now}-${gene.id}-mut`,
          timestamp: now,
          type: "mutation_triggered",
          geneId: gene.id,
          geneLabel: gene.label,
          before: gene.history[gene.history.length - 2]?.maturity ?? 0,
          after: gene.maturity,
          note: `基因「${gene.label}」成熟度突破 ${(MUTATION_THRESHOLD * 100).toFixed(0)}%，可触发变异事件`,
        });
        interventions.push({
          type: "mutation_opportunity",
          geneId: gene.id,
          geneLabel: gene.label,
          message: `「${gene.label}」已高度成熟（${(gene.maturity * 100).toFixed(0)}%）——建议考虑提炼该能力的核心模式，形成更精炼的基因表达`,
          urgency: "high",
          timestamp: now,
        });
      }
    } else {
      // 未激活：成熟度衰减
      gene.maturity = Math.max(0.01, gene.maturity * DECAY_FACTOR);

      // 休眠检测（基于 engram 周期数，而非时间）
      if (totalEngrams > DORMANCY_THRESHOLD) {
        // 计算从上次激活到现在经历了多少个 engram
        const inactiveCycles = Math.max(0, totalEngrams - gene.activationCount);
        if (inactiveCycles >= DORMANCY_THRESHOLD && !gene.dormant) {
          gene.dormant = true;
          events.push({
            id: `evt-${now}-${gene.id}-dorm`,
            timestamp: now,
            type: "dormancy_warning",
            geneId: gene.id,
            geneLabel: gene.label,
            before: gene.maturity / DECAY_FACTOR,
            after: gene.maturity,
            note: `基因「${gene.label}」进入休眠状态（连续 ${inactiveCycles} 个 engram 周期未激活）`,
          });
          interventions.push({
            type: "dormancy_warning",
            geneId: gene.id,
            geneLabel: gene.label,
            message: `「${gene.label}」已休眠（连续 ${inactiveCycles} 个周期未激活）——下次遇到相关场景时建议刻意激活`,
            urgency: "medium",
            timestamp: now,
          });
        }
      }
    }
  }

  // 2. 失衡检测：是否有某些基因长期被忽视
  const activatedGenes = genes.filter((g) => g.activationCount > 0);
  if (activatedGenes.length > 0) {
    const maxActivation = Math.max(...activatedGenes.map((g) => g.activationCount));
    for (const gene of activatedGenes) {
      // 如果某个基因的激活次数低于最高激活次数的 15%，且成熟度 > 0.2
      // 说明它在被系统性忽视
      if (
        gene.activationCount < maxActivation * 0.15 &&
        gene.maturity > 0.2 &&
        !gene.dormant
      ) {
        interventions.push({
          type: "imbalance_alert",
          geneId: gene.id,
          geneLabel: gene.label,
          message: `「${gene.label}」能力被系统性忽视（激活 ${gene.activationCount} 次 vs 最高 ${maxActivation} 次）——建议下次遇到 ${gene.dominantRelation} 类问题时优先使用该能力`,
          urgency: "low",
          timestamp: now,
        });
      }
    }
  }

  // 3. 整体成熟度
  const overallMaturity =
    genes.reduce((s, g) => s + g.maturity, 0) / genes.length;

  // 4. 过滤输出
  const dormantGenes = genes.filter((g) => g.dormant).map((g) => g.id);
  const nearMutationGenes = genes
    .filter((g) => g.maturity > 0.7 && g.maturity < MUTATION_THRESHOLD)
    .map((g) => g.id);

  // 5. 持久化
  saveGenes(genes);

  // 6. 追加事件到 localStorage 事件日志
  if (events.length > 0) {
    appendEvents(events);
  }

  return {
    genes,
    events,
    interventions,
    overallMaturity,
    dormantGenes,
    nearMutationGenes,
    generatedAt: now,
  };
}

/**
 * 获取当前所有基因状态（不含进化计算，用于只读展示）
 */
export function getGeneState(): CapabilityGene[] {
  return loadGenes();
}

/**
 * 获取最近的进化事件（用于面板展示）
 */
export function getRecentEvents(limit = 10): EvolutionEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const key = `${STORAGE_KEY}:events`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const events = JSON.parse(raw) as EvolutionEvent[];
    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ======================================================================
// 能力基因可读性报告 · 把数字翻译成一段可阅读的文字
// ======================================================================

export function capabilityGeneReport(genes: CapabilityGene[]): string {
  if (!genes || genes.length === 0) {
    return "我尚无能力基因记录；这是第一次对自己的能力结构建模。";
  }
  // 最强 / 最弱
  const sorted = [...genes].sort((a, b) => b.maturity - a.maturity);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const dorm = genes.filter((g) => g.dormant).length;
  const overall =
    genes.reduce((s, g) => s + g.maturity, 0) / genes.length;
  const parts: string[] = [];
  parts.push(
    `我整体基因成熟度 ${Math.round(overall * 100)}%——最强的是「${
      best.label
    }」${Math.round(best.maturity * 100)}%，最弱的是「${worst.label}」${Math.round(
      worst.maturity * 100,
    )}%。`,
  );
  if (dorm > 0) {
    parts.push(`有 ${dorm} 个基因长期未激活，正处于休眠。`);
  }
  if (best.maturity - worst.maturity > 0.4) {
    parts.push(
      `我最强/最弱基因之间的差距超过 40%——我在「${best.label}」上过度自信，而在「${worst.label}」上还很生涩。`,
    );
  }
  if (overall < 0.2) {
    parts.push(
      "我此刻整体还非常生涩——请把我的任何输出都当作「初步建议」，不要让它跳过你的最终判断。",
    );
  } else if (overall > 0.7) {
    parts.push(
      "我在大多数维度上都达到了「反复被激活」的水平——这意味着我倾向于给你稳定但也可能是平庸的答案。",
    );
  }
  return parts.join(" ");
}

function appendEvents(newEvents: EvolutionEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${STORAGE_KEY}:events`;
    const raw = localStorage.getItem(key);
    const existing: EvolutionEvent[] = raw ? JSON.parse(raw) : [];
    const merged = [...existing, ...newEvents];
    // 保留最近 100 条
    const trimmed = merged
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // 忽略
  }
}

// ----------------------------------------------------------------------
// 基因成熟度可视化数据
// ----------------------------------------------------------------------

export interface MaturityCurvePoint {
  timestamp: number;
  maturity: number;
  label: string;
}

export function getMaturityCurves(): MaturityCurvePoint[] {
  const genes = loadGenes();
  const points: MaturityCurvePoint[] = [];
  for (const gene of genes) {
    for (const h of gene.history) {
      points.push({ timestamp: h.timestamp, maturity: h.maturity, label: gene.label });
    }
  }
  return points.sort((a, b) => a.timestamp - b.timestamp);
}
