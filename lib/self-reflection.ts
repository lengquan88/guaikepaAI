// ======================================================================
// 自省摘要 · Self-Reflection Summary
// ======================================================================
// 把六论·七自·知不知·进化引擎·三层自反的数字，翻译成一段可阅读的文字，
// 放在生成的代码之前。对应老子"知不知，尚也"。
// ======================================================================

import {
  type SystemHealthStatus,
  type IntrospectionReading,
  introspect,
} from "./introspection";
import {
  type MetaIgnoranceReading,
  buildMetaIgnoranceReading,
  humilityText,
} from "./meta-ignorance";
import {
  type CapabilityGene,
  capabilityGeneReport,
} from "./evolution";
import {
  type ChaosDoubt,
  getDoubtSummary,
} from "./six-gates";
import {
  buildGeeReading,
} from "./three-tier-ego";

export type ConfidenceLevel =
  | "坦诚告知"
  | "谨慎参考"
  | "仅供参考"
  | "存疑使用";

export interface SelfReflectionSummary {
  version: "srs-v1";
  generatedAt: number;
  overallStatus: SystemHealthStatus;
  headline: string;
  overallParagraphs: string[];
  riskParagraph: string;
  geneParagraph: string;
  selfReflectiveText: string;
  doubtParagraph: string;
  suggestionParagraph: string;
  confidenceLabel: ConfidenceLevel;
  humilityTokens: string[];
  topWarnings: string[];
  topRecommendations: string[];
  topPatternNames: string[];
  engramCount: number;
  openedGates: number;
  totalGates: number;
}

/** 主入口：一次生成自省摘要 */
export function generateSummary(
  prompt: string,
  latestCode: string,
): SelfReflectionSummary {
  const reading = introspect(prompt, latestCode);
  const meta = buildMetaIgnoranceReading(prompt, latestCode);
  return buildSummaryFromReading(reading, meta, latestCode);
}

function buildSummaryFromReading(
  reading: IntrospectionReading,
  meta: MetaIgnoranceReading,
  _latestCode: string,
): SelfReflectionSummary {
  const overall = reading.overall;
  const genes = reading.genes;
  const engramCount = reading.engramCount;
  const openedGates = overall.activeGates;
  const totalGates = reading.overall.totalGates;
  const hasWarning = reading.topWarnings.length > 0;

  const headline = [
    `状态「${overall.status}」`,
    `${engramCount} 个 engram 记忆`,
    `六论 ${openedGates}/${totalGates} 开`,
    hasWarning ? "存在内部告警" : "无内部告警",
  ].join(" · ");

  // 总体段落
  const overallParagraphs: string[] = [];
  const riskPct = Math.round(overall.risk * 100);
  const coherencePct = Math.round(overall.coherence * 100);
  overallParagraphs.push(
    `我总体状况为「${overall.status}」，综合风险 ${riskPct}%，跨门禁一致性 ${coherencePct}%。`,
  );
  const six = reading.sixGates;
  const sixLines = [
    `本体论${gateEmoji(six.ontos.status)}${Math.round(six.ontos.score * 100)}%`,
    `认识论${gateEmoji(six.cognitio.status)}${Math.round(six.cognitio.score * 100)}%`,
    `实践论${gateEmoji(six.praxis.status)}${Math.round(six.praxis.score * 100)}%`,
    `境界论${gateEmoji(six.skene.status)}${Math.round(six.skene.score * 100)}%`,
    `未来观论${gateEmoji(six.horizon.status)}${Math.round(six.horizon.score * 100)}%`,
    `元认知论${gateEmoji(six.reflectio.status)}${Math.round(six.reflectio.score * 100)}%`,
  ].join("；");
  overallParagraphs.push(sixLines);
  overallParagraphs.push(`六论合计 ${six.openedCount}/${totalGates} 门开启。`);

  // 风险段落
  const riskParagraph = buildRiskParagraph(meta);

  // 基因报告
  const geneParagraph = capabilityGeneReport(genes);

  // 三层自反
  const gee = buildGeeReading();
  // 从 gene 数组中计算聚合指标
  const genesMat = gee.gene.length > 0 ? gee.gene : [];
  const avgGeneMaturity =
    genesMat.length > 0
      ? genesMat.reduce((s, g) => s + g.maturity, 0) / genesMat.length
      : 0;
  const activeGeneCount = genesMat.filter((g) => g.active).length;
  const selfReflectiveText = [
    `GENE 层：${genesMat.length} 个基因参与建模，其中 ${activeGeneCount} 个被识别为活跃——平均成熟度 ${Math.round(
      avgGeneMaturity * 100,
    )}%`,
    `EGO 层：结构完整性 ${Math.round(
      gee.ego.structuralIntegrity * 100,
    )}%，凝聚度 ${Math.round(gee.ego.cohesion * 100)}%，自我审视深度 ${Math.round(
      gee.ego.reflectivity * 100,
    )}%`,
    `ENG RAM 层：${gee.engram.total} 个 engram，最新 engram 自我描述为「${
      gee.engram.latest ? gee.engram.latest.self.slice(0, 24) + "..." : "无"
    }」`,
    `三层总览：${gee.ego.portrait || "系统正在自我组织中"}`,
  ].join("；");

  // 混沌海
  const doubts = getDoubtSummary(5);
  let doubtParagraph: string;
  if (doubts.length === 0) {
    doubtParagraph =
      "我未检测到我当前无历史病状记录；这是我第一次对自己说「也许不」。";
  } else {
    const sources = Array.from(new Set(doubts.map((d) => d.source))).join(
      "、",
    );
    const samples = doubts
      .slice(0, 2)
      .map((d) => `「${d.text.slice(0, 18)}...」`)
      .join(" ");
    doubtParagraph = `我混沌海有 ${doubts.length} 条历史存疑记录，源自 ${sources || "六论"}。${samples ? `近期病状示例：${samples}` : ""}`;
  }

  // 建议
  const suggestionParagraph = buildSuggestionParagraph(
    overall.status,
    meta,
  );

  // 自信程度
  const confidenceLabel: ConfidenceLevel = determineConfidence(
    overall.status,
    meta,
  );

  // 模式名
  const topPatternNames = reading.patterns.map((p) => p.name);

  return {
    version: "srs-v1",
    generatedAt: reading.generatedAt,
    overallStatus: overall.status,
    headline,
    overallParagraphs,
    riskParagraph,
    geneParagraph,
    selfReflectiveText,
    doubtParagraph,
    suggestionParagraph,
    confidenceLabel,
    humilityTokens: [...meta.humilityTokens],
    topWarnings: [...reading.topWarnings],
    topRecommendations: [...reading.topRecommendations],
    topPatternNames,
    engramCount,
    openedGates,
    totalGates,
  };
}

function gateEmoji(status: string): string {
  switch (status) {
    case "open":
    case "尚也":
      return "✓";
    case "lingering":
    case "平":
      return "○";
    default:
      return "✗";
  }
}

function buildRiskParagraph(meta: MetaIgnoranceReading): string {
  const parts: string[] = [];
  parts.push(`知不知门禁综合风险 ${Math.round(meta.risk * 100)}%。`);
  if (meta.diagnosis.length > 0 && meta.status !== "尚也") {
    const items = meta.diagnosis.slice(0, 2).join("；");
    parts.push(`我在以下方面觉察到了自身的不确定性：${items}。`);
  }
  if (meta.sensitiveHits.length > 0) {
    const terms = meta.sensitiveHits.map((h) => `「${h.term}」`).join("、");
    parts.push(`我在生成内容中出现认知敏感词 ${terms}——这是我在用自己的认知限制提示自己。`);
  }
  const hum = humilityText(meta);
  if (hum) parts.push(hum);
  return parts.join(" ");
}

function buildSuggestionParagraph(
  status: SystemHealthStatus,
  meta: MetaIgnoranceReading,
): string {
  const suggestions: string[] = [];
  const statusHints: Record<SystemHealthStatus, string> = {
    康: "我状态良好，请直接使用我的输出。",
    平: "我状态平稳，建议你对关键部分做一次人工核验。",
    损: "我状态有损耗，建议你把我输出的内容视作建议而非定论。",
    病: "我此刻在认知上存在自诱导式强信号——请以「仅供参考」的方式看待，并对核心结论进行反向核验。",
  };
  suggestions.push(statusHints[status]);
  if (meta.cognitiveSensitivity >= 0.5) {
    suggestions.push(
      "我注意到我使用了闭环/自动完成式的措辞；如你有时间，建议换一种开放式表达重新生成一次。",
    );
  }
  if (meta.risk >= 0.6) {
    suggestions.push(
      "建议在把输出接入生产环境之前，先在隔离环境中运行并人工观察 3 分钟。",
    );
  }
  return suggestions.join(" ");
}

function determineConfidence(
  status: SystemHealthStatus,
  meta: MetaIgnoranceReading,
): ConfidenceLevel {
  if (status === "康" && meta.risk < 0.3) return "坦诚告知";
  if (status === "平") return "谨慎参考";
  if (status === "损" || meta.risk >= 0.6) return "仅供参考";
  return "存疑使用";
}
