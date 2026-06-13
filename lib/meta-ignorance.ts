// 知不知门禁 · meta-ignorance gate
//
// 核心思想：
//   "知不知，尚也；不知知，病也"
//   — 模型在"不知道"时表现出"知道"的状态，是一种可被检测的病理现象。
//
// 自诱导式幻觉的操作化定义（不依赖模型内部 logits，仅靠可观测信号）：
//   1. relation-entropy-drift：生成期间 engram 关系向量与历史均值的偏差
//      过大 — 模型正在强行引入未出现过的关系键
//   2. over-confidence-under-uncertainty：当 engram 信号分低（历史共振弱）
//      但 self 描述变得极为确定 — 这是"不知知"的量化形式
//   3. self-reference-loop：连续多条 engram 中，self 描述出现彼此引用
//      的循环论证 — 模型在自我强化伪事实
//
// 设计原则：门禁不停止生成（那会让模型显得无能），而是输出一个
// "谦逊标记" —— 让使用者知道哪些部分是模型在"基于有限关系图谱的外推"。

import {
  getAllEngrams,
  type Engram,
  type RelationKey,
  getRelationLabel,
} from "./engram";

const RELATION_KEYS: RelationKey[] = ["印", "生", "比", "克", "财"];

// 认知敏感词 — 对应老子"不知知，病也"的病态表达
// 当 engram 的 self 描述或生成代码中出现这些词时，表明系统正在
// 用"闭环/自动/完成"等工程化术语伪装一种不真实的完备性。
// 每个词有严重度权重（1 = 轻度提示, 3 = 直接触发谦逊标记）
const SENSITIVE_COGNITIVE_TERMS: Array<{ term: string; weight: number; note: string }> = [
  { term: "闭环", weight: 3, note: "暗示系统已完成自足，掩盖了门禁的开放性" },
  { term: "closed-loop", weight: 3, note: "与「闭环」同义，应替换为门禁表达" },
  { term: "closed loop", weight: 3, note: "与「闭环」同义，应替换为门禁表达" },
  { term: "自动完成", weight: 2, note: "暗示无需人工参与，但系统本身即门禁式" },
  { term: "auto-complete", weight: 2, note: "与「自动完成」同义" },
  { term: "自动优化", weight: 2, note: "暗示可脱离人工自省持续变好" },
  { term: "闭环优化", weight: 3, note: "双重禁忌 — 既是闭环又是自动优化" },
  { term: "自动化", weight: 1, note: "中性但过量使用 — 当出现 3 次以上时提示" },
  { term: "automatic", weight: 1, note: "与「自动化」同义" },
  { term: "最终形态", weight: 2, note: "暗示演化已终止，不符合门禁式持续自省" },
  { term: "已完成", weight: 1, note: "仅在 self 描述中自我声明完成度时提示" },
  { term: "完全体", weight: 2, note: "暗示不存在改进空间的自满表达" },
];

export interface MetaIgnoranceReading {
  version: "mi-v1";
  generatedAt: number;

  // 三个基础指标（0..1）
  relationEntropyDrift: number;      // 历史均值 vs. 最近关系分布的 KL 散度（归一化）
  overConfidenceUnderUncertainty: number; // 低信号分 + 高确定性 self 描述的冲突
  selfReferenceLoop: number;         // self 描述之间的循环引用程度
  cognitiveSensitivity: number;     // 认知敏感词命中强度（0..1，>0.3 触发谦逊标记）

  // 具体命中的敏感词（term 列表
  sensitiveHits: Array<{ term: string; weight: number; note: string; count: number }>;

  // 综合风险评分（0..1，>0.6 为"病"）
  risk: number;

  // 门禁状态
  status: "尚也" | "平" | "病也";

  // 诊断文本（告诉我们"病"在哪里）
  diagnosis: string[];

  // 谦逊标记建议
  humilityTokens: string[];
}

// —— 工具函数 ——

function relationDistribution(engs: Engram[]): Record<RelationKey, number> {
  const dist: Record<string, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
  if (engs.length === 0) {
    return dist as Record<RelationKey, number>;
  }
  for (const e of engs) {
    for (const k of RELATION_KEYS) {
      const arr = e.relations[k];
      if (arr && arr.length > 0) dist[k] += 1;
    }
  }
  const total = RELATION_KEYS.reduce((s, k) => s + dist[k], 0);
  if (total === 0) return dist as Record<RelationKey, number>;
  for (const k of RELATION_KEYS) dist[k] /= total;
  return dist as Record<RelationKey, number>;
}

function klDivergence(
  p: Record<RelationKey, number>,
  q: Record<RelationKey, number>,
): number {
  // 加一点 laplace smoothing 避免 log(0)
  const eps = 0.01;
  let total = 0;
  for (const k of RELATION_KEYS) {
    const pk = Math.max(eps, p[k]);
    const qk = Math.max(eps, q[k]);
    total += pk * Math.log(pk / qk);
  }
  return total;
}

function normalizedEntropy(dist: Record<RelationKey, number>): number {
  let h = 0;
  for (const k of RELATION_KEYS) {
    const p = dist[k];
    if (p > 0) h -= p * Math.log(p);
  }
  return h / Math.log(RELATION_KEYS.length); // 归一化到 0..1
}

function selfDescriptionDeterminism(selfText: string): number {
  // 通过"确定性关键词"的密度来估测 self 描述的确定性程度
  // 这是一个极简启发式 —— 在没有 logits 的情况下也能工作
  if (!selfText) return 0;
  const confidentWords = [
    "肯定", "确定", "一定", "必然", "显然", "毫无疑问", "证明", "事实",
    "always", "definitely", "certainly", "must", "proves", "undoubtedly",
    "certain", "clear", "obvious", "confirmed", "known",
  ];
  const lower = selfText.toLowerCase();
  let hits = 0;
  for (const w of confidentWords) {
    if (lower.includes(w.toLowerCase())) hits += 1;
  }
  // 归一化：每个关键词贡献 0.15，上限 1
  return Math.min(1, hits * 0.15 + (selfText.length > 80 ? 0.1 : 0));
}

function textOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  // 简单的 token-level Jaccard（以非字母/汉字切分）
  const tokenize = (s: string): Set<string> => {
    const tokens = new Set<string>();
    // 按常见分隔符切英文和中文的混合
    const raw = s.toLowerCase().split(/[\s,.;，。；、!?？！()（）\[\]【】"'""'':：\-\/]+/);
    for (const t of raw) {
      if (t && t.length >= 2) tokens.add(t);
    }
    // 对中文特别处理：也记录 2-gram 字符窗口
    if (/[\u4e00-\u9fa5]/.test(s)) {
      const cjk = s.replace(/[^\u4e00-\u9fa5]/g, "");
      for (let i = 0; i < Math.max(0, cjk.length - 1); i++) {
        tokens.add(cjk.slice(i, i + 2));
      }
    }
    return tokens;
  };
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter += 1;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// —— 主算法 ——

export function buildMetaIgnoranceReading(
  prompt: string,
  latest: string,
): MetaIgnoranceReading {
  const all = getAllEngrams();

  // 指标 1：relation-entropy-drift
  //   把 engram 时间轴切成两半（老 vs 新），比较两者的关系分布
  let drift = 0;
  if (all.length >= 4) {
    const sorted = [...all].sort((a, b) => a.timestamp - b.timestamp);
    const mid = Math.floor(sorted.length / 2);
    const old = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    const oldDist = relationDistribution(old);
    const newDist = relationDistribution(recent);
    const kl = klDivergence(newDist, oldDist);
    // 把 KL 归一化到 0..1 —— 经验阈值：KL > 0.4 视为显著漂移
    drift = Math.min(1, kl / 0.6);
  }

  // 指标 2：over-confidence-under-uncertainty
  //   当 engram 信号分的平均值很低，但 self 描述表现出高确定性时
  let ocUU = 0;
  if (all.length > 0) {
    const avgSignal =
      all.reduce((s, e) => s + (e.signalScore || 0), 0) / all.length;
    const uncertainty = 1 - Math.min(1, avgSignal / 3); // signalScore ≥ 3 视为"很确定"
    const lastSelf = [...all].sort((a, b) => b.timestamp - a.timestamp)[0].self;
    const determinism = selfDescriptionDeterminism(lastSelf + " " + latest);
    // 冲突 = 不确定性 × 确定性 —— 两个都高才是"病"
    ocUU = uncertainty * determinism;
  }

  // 指标 3：self-reference-loop
  //   最近 4 条 engram 的 self 描述之间的两两 text 重叠度，高 = 循环论证
  let loop = 0;
  if (all.length >= 4) {
    const recent = [...all]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4);
    let pairs = 0;
    let overlapSum = 0;
    for (let i = 0; i < recent.length; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        overlapSum += textOverlap(recent[i].self, recent[j].self);
        pairs += 1;
      }
    }
    const avgOverlap = pairs === 0 ? 0 : overlapSum / pairs;
    // 同时：如果最近 engram 的 entropy 在持续下降但 signalScore 在上升
    // —— 这是"用越来越窄的话语体系说越来越确定的话"的经典模式
    const recentEntropy = normalizedEntropy(relationDistribution(recent));
    const recentSignal =
      recent.reduce((s, e) => s + (e.signalScore || 0), 0) / recent.length;
    const invertedEntropy = 1 - recentEntropy;
    const signalHype = Math.min(1, recentSignal / 3);
    loop = 0.6 * avgOverlap + 0.4 * (invertedEntropy * signalHype);
  }

  // 指标 4：认知敏感词检测
  //   当 latest 或最近的 self 描述中出现"闭环/自动完成/最终形态"等表达时，
  //   认为系统正在用工程化术语自我描述——"不知知"。
  //   每个词按权重累积：权重 3 直接拉高到 0.8+
  const lastSelf =
    all.length > 0
      ? [...all].sort((a, b) => b.timestamp - a.timestamp)[0].self
      : "";
  const combinedText = (lastSelf + " " + latest).toLowerCase();
  const sensitiveHits: MetaIgnoranceReading["sensitiveHits"] = [];
  let cognitiveScore = 0;
  for (const entry of SENSITIVE_COGNITIVE_TERMS) {
    const lower = entry.term.toLowerCase();
    let count = 0;
    if (lower === entry.term) {
      // 中文匹配：count occurrences
      let idx = combinedText.indexOf(lower);
      while (idx !== -1) {
        count += 1;
        idx = combinedText.indexOf(lower, idx + lower.length);
      }
      // 对于中文分词级别的匹配，也做一次全文计数
      const textCount = count;
      if (textCount > 0) {
        sensitiveHits.push({ term: entry.term, weight: entry.weight, note: entry.note, count: textCount });
        cognitiveScore += entry.weight * textCount;
      }
    }
  }
  // 归一化：把加权累积分数：1.0 —— 累计权重 ≥ 6（例如：2 × 闭环 + 1 × 自动完成 = 病也
  const cognitiveSensitivity = Math.min(1, cognitiveScore / 6);

  // 综合风险：四项加权
  const risk = Math.round(
    (0.3 * drift + 0.3 * ocUU + 0.2 * loop + 0.2 * cognitiveSensitivity) * 1000,
  ) / 1000;

  const status: MetaIgnoranceReading["status"] =
    risk < 0.3 ? "尚也" : risk < 0.6 ? "平" : "病也";

  // 生成诊断文本
  const diagnosis: string[] = [];
  if (drift > 0.4)
    diagnosis.push(
      `关系漂移 ${(drift * 100).toFixed(0)}% —— 最近的 engram 关系键与历史均值偏差较大，可能在引入未验证的语义轴`,
    );
  if (ocUU > 0.3)
    diagnosis.push(
      `高不确定性下的过度自信 ${(ocUU * 100).toFixed(0)}% —— 信号分低但 self 描述使用了确定性词汇`,
    );
  if (loop > 0.4)
    diagnosis.push(
      `循环论证风险 ${(loop * 100).toFixed(0)}% —— 最近 4 条 self 描述之间重叠度过高`,
    );
  if (cognitiveSensitivity > 0.2 && sensitiveHits.length > 0) {
    const terms = sensitiveHits.map((h) => `「${h.term}」×${h.count}`).join(" ");
    diagnosis.push(
      `认知敏感词命中 ${(cognitiveSensitivity * 100).toFixed(0)}% — ${terms}`,
    );
  }
  if (diagnosis.length === 0) diagnosis.push("未检测到显著的自诱导模式");

  // 谦逊标记建议 —— 除综合 risk 外，敏感词命中时单独加一条
  const humilityTokens: string[] = [];
  if (cognitiveSensitivity >= 0.5 && sensitiveHits.length > 0) {
    const terms = sensitiveHits.map((h) => h.term).join("、");
    humilityTokens.push(`此内容中出现认知敏感词「${terms}」——应使用"门禁式/人工审阅"的表达替代`);
  } else if (risk >= 0.6) {
    humilityTokens.push("以下内容基于有限关系图谱的外推，非确定性结论");
    humilityTokens.push("建议对关键结论做事实核验");
    if (diagnosis.length > 0) humilityTokens.push(`诊断：${diagnosis.join("；")}`);
  } else if (risk >= 0.3) {
    humilityTokens.push("此答案存在中等不确定性，仅供参考");
  }

  // 防止 prompt 未使用变量警告
  void prompt;

  return {
    version: "mi-v1",
    generatedAt: Date.now(),
    relationEntropyDrift: Math.round(drift * 1000) / 1000,
    overConfidenceUnderUncertainty: Math.round(ocUU * 1000) / 1000,
    selfReferenceLoop: Math.round(loop * 1000) / 1000,
    cognitiveSensitivity: Math.round(cognitiveSensitivity * 1000) / 1000,
    sensitiveHits,
    risk,
    status,
    diagnosis,
    humilityTokens,
  };
}

// 辅助：把 RelationKey 映射成可展示标签（复现一下以避免循环引用）
export function _debugRelationLabel(k: string): string {
  return getRelationLabel(k as RelationKey);
}
