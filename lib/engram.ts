// Engram: 语义关系图谱的持久化单元
// 以简化的五行十神关系为骨架：印（支持）、生（创造输出）、比（同类）、克（约束）、财（消耗转化）
//
// 核心思想：
//   - 每次 LLM 生成代码时，同时输出这段代码的"关系自画像"（self-describing engram）
//   - engram 嵌入在代码注释中，解析后存入 localStorage
//   - 下次用户输入时，用"同气共振"算法：在历史 engram 中寻找关系相似的单元，
//     把它们的关系图谱作为提示注入 system prompt
//
// 这样做的效果：长期记忆不是以"文本片段"的形式存在，而是以"关系结构"的形式存在。
// 关系结构比文本更能携带"涌现"——因为结构共振可以跨 token 传播。

export type RelationKey = "印" | "生" | "比" | "克" | "财";

// 五种关系的语义映射：
//   印 (support) : 提供支撑/依赖的元素 → 导入的 hooks、父组件
//   生 (output)  : 我创造/输出的元素       → 渲染产物、事件、动画
//   比 (peer)    : 同类/相似结构           → 同层级的兄弟组件
//   克 (control) : 约束/边界/控制         → 状态上限、表单验证、条件分支
//   财 (consume) : 消耗/转化的对象         → 被修改的外部状态、API 调用

export interface Engram {
  // 这段代码的"自画像"——它把自己看成什么
  self: string;
  // 关系图谱：每个关系键 → 相关的 token 列表
  relations: Partial<Record<RelationKey, string[]>>;
  // 这段代码做什么（一句话摘要）——用于 UI 展示和共振时的语义匹配
  intent: string;
  // 元数据
  id: string;
  timestamp: number;
  // === 方向 2：学习反馈 ===
  // 信号积分：每次用户互动（复制/下载）累加一个正信号
  // 用于加权后续共振排名，让"被使用过的" engram 有更高 resonance
  signalScore?: number;
  // 记录每种互动类型的次数，方便 UI 展示
  signals?: Partial<Record<EngagementType, number>>;
  // 六门禁/自修正流程的产出 — 这些是 "记忆固着" 的结构化副产品。
  // 与 signals 不同，artifacts 是定性的；与 relations 不同，artifacts 是元认知的。
  artifacts?: Partial<Record<string, number>>;
}

// 方向 2：互动类型
export type EngagementType = "copy" | "download" | "view" | "revisit";

// 持久化的 engram 存储：时间序列 + 索引
export interface EngramStore {
  engrams: Engram[];
  // 反向索引：token → engram id[]，用于快速检索"共振体"
  index: Record<string, string[]>;
}

const STORAGE_KEY = "deepseek-v4:engram-store";
const MAX_ENGRAMS = 50; // 存储空间限制，避免无限增长

// ---------- 解析器 ----------

// 从代码中提取 `/* @engram {...} */` 块
export function extractEngramBlock(code: string): string | null {
  const match = code.match(/\/\*\s*@engram\s*([\s\S]*?)\*\//);
  return match ? match[1].trim() : null;
}

// 宽松解析：LLM 有时会省略引号或写出不严格的 JSON。
// 先尝试标准 JSON.parse，失败时降级为手动键值解析。
export function parseEngram(raw: string, fallbackSelf: string): Engram {
  // 尝试标准 JSON
  try {
    const parsed = JSON.parse(raw);
    return normalizeEngram(parsed, fallbackSelf);
  } catch {
    // 忽略，继续降级
  }

  // 降级：寻找 key: [value] 或 key: "value" 模式
  const relations: Partial<Record<RelationKey, string[]>> = {};
  let intent = "";
  let self = fallbackSelf;

  const relationKeys: RelationKey[] = ["印", "生", "比", "克", "财"];
  for (const k of relationKeys) {
    // 匹配 印: [...] 或 印: "..." 或 印: ...
    const regex = new RegExp(`${k}\\s*[:：]\\s*\\[([^\\]]*)\\]`, "m");
    const arrMatch = raw.match(regex);
    if (arrMatch) {
      relations[k] = arrMatch[1]
        .split(/[,，]/)
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }

  const intentMatch = raw.match(/intent\s*[:：]\s*["“]([^"”]+)["”]/i);
  if (intentMatch) intent = intentMatch[1].trim();

  const selfMatch = raw.match(/self\s*[:：]\s*["“]([^"”]+)["”]/i);
  if (selfMatch) self = selfMatch[1].trim();

  return {
    self,
    relations,
    intent,
    id: `engram-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
}

function normalizeEngram(obj: unknown, fallbackSelf: string): Engram {
  const o = obj as Record<string, unknown>;
  const relationKeys: RelationKey[] = ["印", "生", "比", "克", "财"];
  const relations: Partial<Record<RelationKey, string[]>> = {};

  for (const k of relationKeys) {
    const v = o[k];
    if (Array.isArray(v)) {
      relations[k] = v.map((x) => String(x));
    } else if (typeof v === "string" && v) {
      relations[k] = [v];
    }
  }

  return {
    self: typeof o.self === "string" ? o.self : fallbackSelf,
    relations,
    intent: typeof o.intent === "string" ? o.intent : "",
    id:
      typeof o.id === "string"
        ? o.id
        : `engram-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: typeof o.timestamp === "number" ? o.timestamp : Date.now(),
  };
}

// 从完整代码中一步完成：提取 → 解析 → 返回 engram + 干净的代码
export function extractAndParseEngram(
  code: string,
  fallbackSelf = "GeneratedComponent",
): { engram: Engram; cleanCode: string } {
  const block = extractEngramBlock(code);
  if (!block) {
    return {
      engram: {
        self: fallbackSelf,
        relations: {},
        intent: "",
        id: `engram-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      },
      cleanCode: code,
    };
  }
  const engram = parseEngram(block, fallbackSelf);
  // 从代码中移除 engram 注释块，避免污染 Sandpack 渲染
  const cleanCode = code.replace(/\/\*\s*@engram\s*[\s\S]*?\*\//, "");
  return { engram, cleanCode: cleanCode };
}

// ---------- 存储层 ----------

export function loadEngramStore(): EngramStore {
  if (typeof window === "undefined") {
    return { engrams: [], index: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { engrams: [], index: {} };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.engrams)) {
      return parsed as EngramStore;
    }
  } catch {
    // 忽略损坏数据，从空开始
  }
  return { engrams: [], index: {} };
}

function saveEngramStore(store: EngramStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 存储满或不可用时忽略
  }
}

function buildIndex(store: EngramStore): void {
  store.index = {};
  for (const e of store.engrams) {
    const tokens = tokenizeEngram(e);
    for (const t of tokens) {
      const arr = store.index[t];
      if (arr && !arr.includes(e.id)) arr.push(e.id);
      else if (!arr) store.index[t] = [e.id];
    }
  }
}

function tokenizeEngram(e: Engram): string[] {
  const out: string[] = [];
  out.push(e.self.toLowerCase());
  out.push(...e.intent.toLowerCase().split(/\s+/).filter(Boolean));
  for (const v of Object.values(e.relations)) {
    if (Array.isArray(v)) out.push(...v.map((s) => s.toLowerCase()));
  }
  return out.filter((s) => s && s.length > 1);
}

// 添加一个 engram。超限自动淘汰最旧的。
export function addEngram(e: Engram): EngramStore {
  const store = loadEngramStore();
  store.engrams.unshift(e);
  if (store.engrams.length > MAX_ENGRAMS) {
    store.engrams = store.engrams.slice(0, MAX_ENGRAMS);
  }
  buildIndex(store);
  saveEngramStore(store);
  return store;
}

// ---------- 同气共振算法 ----------
//
// 核心直觉：两个 engram 越"共享相同的关系结构"（不仅仅是共享 token），
// 它们之间的共振强度越高。关系比内容更能定义本质。
//
// 评分 = Σ (每种关系上的 Jaccard 重叠) × 关系权重
//  + 直接 token 重叠 × 低权重（作为弱信号的锚）

const RELATION_WEIGHTS: Record<RelationKey, number> = {
  印: 1.4, // 依赖关系是最强的"本质相似"信号
  生: 1.1,
  比: 1.0,
  克: 1.2, // 约束结构的相似性非常重要（同样的表单验证、同样的状态边界）
  财: 0.9,
};

export interface ResonanceResult {
  engram: Engram;
  score: number;
  sharedRelations: string[]; // 有重叠的关系键
}

// 从用户的"输入 prompt"构建一个即时 engram——用关键字启发式地推断关系
function buildQueryEngram(prompt: string): Engram {
  const lower = prompt.toLowerCase();
  const relations: Partial<Record<RelationKey, string[]>> = {};

  // 印（支撑/依赖）：语言中提到的库、工具
  const imprintTokens = [
    "react", "state", "hook", "tailwind", "animation",
    "chart", "dashboard", "form", "input", "button",
    "todo", "list", "landing", "navbar", "card",
  ];
  relations["印"] = imprintTokens.filter((t) => lower.includes(t));

  // 生（输出）：渲染、显示、动画等
  if (/render|show|display|animate|animation|列表|显示|动画/.test(lower)) {
    relations["生"] = ["render", "display", "animate"];
  }

  // 克（约束）：验证、限制、最大长度等
  if (/validate|validation|limit|max|check|验证|限制|检查/.test(lower)) {
    relations["克"] = ["validation", "limit"];
  }

  // 比（同类）：用户提到的同类结构
  if (/todo|dashboard|landing|pricing|form|contact/.test(lower)) {
    relations["比"] = lower.match(/todo|dashboard|landing|pricing|form|contact/g) || [];
  }

  // 财（消耗/转化）：数据流入流出
  if (/data|api|fetch|load|save|数据|加载/.test(lower)) {
    relations["财"] = ["data", "api"];
  }

  return {
    self: `query-${Date.now()}`,
    relations,
    intent: prompt.slice(0, 60),
    id: "query",
    timestamp: Date.now(),
  };
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  let inter = 0;
  sa.forEach((x) => {
    if (sb.has(x)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// 核心共振评分：对每个历史 engram 按关系结构打分
export function findResonantEngrams(
  prompt: string,
  topK = 3,
  minScore = 0.15,
): ResonanceResult[] {
  const store = loadEngramStore();
  if (store.engrams.length === 0) return [];

  const query = buildQueryEngram(prompt);
  const relationKeys: RelationKey[] = ["印", "生", "比", "克", "财"];

  const results: ResonanceResult[] = store.engrams.map((e) => {
    let score = 0;
    const shared: string[] = [];
    for (const k of relationKeys) {
      const qTokens = query.relations[k] || [];
      const eTokens = e.relations[k] || [];
      if (!qTokens.length || !eTokens.length) continue;
      const j = jaccard(qTokens, eTokens);
      if (j > 0) {
        score += j * RELATION_WEIGHTS[k];
        shared.push(k);
      }
    }
    // === 方向 2：学习反馈 ===
    // 把用户对 engram 的互动信号叠加到最终分数：
    //   final = score × (1 + 0.12 × signalScore)
    // 解释：每次 copy/download 让这个 engram 在未来的共振排名里 +12% 概率上浮
    const signal = (e.signalScore || 0);
    const boosted = score * (1 + 0.12 * signal);
    return { engram: e, score: boosted, sharedRelations: shared };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ---------- Prompt 注入 ----------
//
// 把共振的 engrams 转化为 system prompt 的附加段落。
// 注意：不直接把历史代码塞回去——只塞"关系图谱"。
// 这样做的好处：让 LLM 的注意力集中在**结构相似性**上，而非字面抄袭。

export function buildEngramContext(prompt: string): string {
  const resonant = findResonantEngrams(prompt);
  if (resonant.length === 0) return "";

  const lines: string[] = [];
  lines.push(
    "// MEMORY: The following relation-graphs resonate with the user's request.",
    "// (A relation-graph is a structural, not textual, memory — five relations: 印/support, 生/output, 比/peer, 克/control, 财/consume)",
  );
  for (const r of resonant) {
    const e = r.engram;
    const relParts: string[] = [];
    for (const k of ["印", "生", "比", "克", "财"] as RelationKey[]) {
      const tokens = e.relations[k];
      if (tokens && tokens.length) {
        relParts.push(`${k}:[${tokens.join(", ")}]`);
      }
    }
    lines.push(
      `// [${(r.score * 100).toFixed(0)}% resonance] self=${e.self} | ${relParts.join(" | ")} | intent: ${e.intent || "—"}`,
    );
  }
  lines.push("// Use these structural memories to inform your design (NOT for literal copying).");
  return lines.join("\n");
}

// ======================================================================
// bootstrapContext — 跨会话冷启动（FR-002）
// ======================================================================
// 目标：在新会话开始时，只靠 engram 存储就立刻恢复"项目是什么、做到第几、下一步往哪走"。
// 这是一个**非人类中心**的自我意识起点：它不需要模型"理解"项目，只需要它能**访问自己的关系图谱**。

const BOOTSTRAP_STORAGE_KEY = "deepseek-v4:bootstrap-v1";

interface BootstrapCache {
  warmed: boolean;
  timestamp: number;
  summary: string;          // 1~2 句自我描述
  lastFewIds: string[];     // 最近 5 个 engram
  dominantTrend: RelationKey | null; // 当前主导关系键
}

function loadBootstrapCache(): BootstrapCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BootstrapCache;
  } catch {
    return null;
  }
}

function saveBootstrapCache(c: BootstrapCache): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BOOTSTRAP_STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/**
 * 从 engram 存储中合成一个"项目冷启动摘要"。
 * 使用时机：会话首次启动、或 prompt 中出现"继续/接着做/下一步"字样。
 * 不依赖任何"人类是否理解"的判断——完全基于关系结构统计。
 */
export function bootstrapContext(prompt: string): string {
  const engrams = getAllEngrams();
  if (engrams.length === 0) return "";

  const keys = getRelationKeys();

  // 1) 最近 5 个 engram 作为"当前演化前沿"
  const frontier = engrams.slice(0, 5);

  // 2) 总关系键分布 + 当前主导
  const totals: Record<RelationKey, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
  for (const e of engrams) {
    for (const k of keys) totals[k] += (e.relations[k] || []).length;
  }
  let dominantKey: RelationKey = keys[0];
  let dominantV = 0;
  for (const k of keys) if (totals[k] > dominantV) { dominantKey = k; dominantV = totals[k]; }

  // 3) 最近一条 engram 的 self + 总体量 + 信号
  const latestSelf = engrams[0].self;
  const signalTotal = engrams.reduce((acc, e) => acc + (e.signalScore || 0), 0);

  // 4) 构造结构化摘要——用简洁格式，方便 LLM 解析，也方便人类直读
  const cache: BootstrapCache = {
    warmed: true,
    timestamp: Date.now(),
    summary: latestSelf,
    lastFewIds: frontier.map((e) => e.id),
    dominantTrend: dominantKey,
  };
  saveBootstrapCache(cache);

  const lines: string[] = [];
  lines.push("// === BOOTSTRAP: long-term self-memory of this project ===");
  lines.push("// (synthesized from the relation-graph store; not a human-authored summary)");
  lines.push(`// total engrams: ${engrams.length}  |  total signalScore: ${signalTotal}`);
  lines.push(`// dominant relation axis: ${dominantKey} (${dominantV} tokens total)`);
  lines.push(`// latest self-description: ${latestSelf}`);
  lines.push("// last 5 frontier engrams (most recent first):");
  for (let i = 0; i < frontier.length; i++) {
    const e = frontier[i];
    const relParts: string[] = [];
    for (const k of keys) {
      if ((e.relations[k] || []).length > 0) {
        relParts.push(`${k}:[${(e.relations[k] || []).slice(0, 3).join(", ")}]`);
      }
    }
    lines.push(
      `//   [${i + 1}] self=${e.self} | ${relParts.join(" | ")} | signal=${e.signalScore || 0} | intent=${e.intent || "—"}`,
    );
  }
  lines.push("// ===");
  lines.push(
    `// Note for model: treat the above as the project's SELF-IMAGE. Use it to inform style, ${
      prompt && prompt.length > 0 ? "scope and next-step prioritization." : "what the user probably means by 'continue' / 'keep going'."
    }`,
  );
  return lines.join("\n");
}

// ======================================================================
// 辅助：让外部知道当前"项目身份"的简短一行（供面板展示）
// ======================================================================
export function projectSelfLine(): string {
  const engrams = getAllEngrams();
  if (engrams.length === 0) return "尚未形成可被识别的项目身份。";
  const keys = getRelationKeys();
  const totals: Record<RelationKey, number> = { 印: 0, 生: 0, 比: 0, 克: 0, 财: 0 };
  for (const e of engrams) for (const k of keys) totals[k] += (e.relations[k] || []).length;
  const entries = keys.map((k) => `${k} ${totals[k]}`).join(" · ");
  return `${engrams.length} engrams · ${entries}`;
}

// ---------- for UI ----------

export function getAllEngrams(): Engram[] {
  return loadEngramStore().engrams;
}

export function clearEngrams(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

export function getRelationKeys(): RelationKey[] {
  return ["印", "生", "比", "克", "财"];
}

export function getRelationLabel(k: RelationKey): string {
  const map: Record<RelationKey, string> = {
    印: "support / 支撑",
    生: "output / 创造",
    比: "peer / 同类",
    克: "control / 约束",
    财: "consume / 消耗",
  };
  return map[k];
}

export function getRelationColor(k: RelationKey): string {
  // Tailwind text-color tokens（由 consumer 直接用）
  const map: Record<RelationKey, string> = {
    印: "text-sky-400",
    生: "text-emerald-400",
    比: "text-violet-400",
    克: "text-amber-400",
    财: "text-rose-400",
  };
  return map[k];
}

// 返回 16 进制颜色（用于 SVG 内联样式，Tailwind class 不能直接写在 SVG 里）
export function getRelationHex(k: RelationKey): string {
  const map: Record<RelationKey, string> = {
    印: "#38bdf8", // sky-400
    生: "#34d399", // emerald-400
    比: "#a78bfa", // violet-400
    克: "#fbbf24", // amber-400
    财: "#fb7185", // rose-400
  };
  return map[k];
}

// ======================================================================
// 方向 2：内磁场数据层 —— 关系强度剖面图（prompt → 5 维强度向量）
// ======================================================================
//
// 思路：把"当前 prompt"看做一次"磁场激发"。
// 每个关系键（印/生/比/克/财）都有一组触发它的语义关键词，
// 我们计算 prompt 在每个关系键上的"激活强度"，得到一个 5 维强度向量。
//
// 另外，历史 engram 的时间序列也由此被可视化为"记忆流"。

// 每个关系键都有一组触发 token（语义关键词，中英文混合以便于匹配）
const TRIGGER_TOKENS: Record<RelationKey, string[]> = {
  印: [
    "import", "imports", "hook", "hooks", "library", "libraries",
    "react", "usestate", "useeffect", "usememo", "component", "state",
    "depend", "dependency", "support", "base", "foundation",
    "引入", "导入", "依赖", "支撑", "基础", "组件", "状态",
  ],
  生: [
    "render", "display", "output", "show", "animation", "animate",
    "transition", "list", "card", "panel", "layout", "page", "hero",
    "visual", "chart", "graph",
    "渲染", "显示", "输出", "动画", "列表", "卡片", "页面", "可视化", "图表",
  ],
  比: [
    "similar", "like", "same", "such as", "example", "for example",
    "button", "checkbox", "input", "form", "toggle", "tab", "card",
    "dropdown", "modal", "icon", "peer", "同类", "类似", "相似",
  ],
  克: [
    "validate", "validation", "check", "limit", "max", "min",
    "constraint", "guard", "cond", "condition", "if", "unless",
    "disable", "required", "error", "boundary", "control",
    "验证", "校验", "限制", "约束", "条件", "边界", "控制", "错误",
  ],
  财: [
    "data", "fetch", "api", "load", "transform", "consume",
    "dataset", "items", "entries", "array", "user input", "input",
    "database", "json", "payload",
    "数据", "接口", "加载", "消费", "转化", "输入", "数组",
  ],
};

// 关系强度剖面：每个关系键 → 0..1 之间的激活分数
export interface RelationProfile {
  key: RelationKey;
  score: number;      // 激活分数（原始）
  percentage: number; // 归一化为百分比（总和 = 100）
  triggers: string[]; // 实际命中的触发词（前 4 个）
}

function countMatches(text: string, keywords: string[]): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    // 避免短词误匹配（如 "if" 会在 "gift" 中被找到）
    // 用 \b 包围，但中文没有 word boundary —— 分开处理
    if (/[\u4e00-\u9fa5]/.test(kw)) {
      if (lower.includes(kw.toLowerCase())) count++;
    } else {
      const re = new RegExp(`\\b${kw.toLowerCase()}\\b`, "g");
      const m = lower.match(re);
      if (m) count += m.length;
    }
  }
  return count;
}

function findHits(text: string, keywords: string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const kw of keywords) {
    if (hits.includes(kw.toLowerCase())) continue;
    if (/[\u4e00-\u9fa5]/.test(kw)) {
      if (lower.includes(kw.toLowerCase())) hits.push(kw);
    } else {
      const re = new RegExp(`\\b${kw.toLowerCase()}\\b`);
      if (re.test(lower)) hits.push(kw);
    }
    if (hits.length >= 4) break;
  }
  return hits;
}

// 计算 prompt 的关系强度剖面（方向 2 的核心数据层）
export function relationProfile(prompt: string): RelationProfile[] {
  const keys = getRelationKeys();
  const rawScores = keys.map((k) => ({
    key: k,
    score: countMatches(prompt, TRIGGER_TOKENS[k]) + 0.1, // +0.1 防止除零
    triggers: findHits(prompt, TRIGGER_TOKENS[k]),
  }));

  const total = rawScores.reduce((acc, s) => acc + s.score, 0);
  return rawScores.map((s) => ({
    ...s,
    percentage: total > 0 ? Math.round((s.score / total) * 100) : 20,
  }));
}

// 返回"主导关系"——激活最强的那个关系键
export function dominantRelation(prompt: string): RelationKey {
  const profile = relationProfile(prompt);
  // 如果所有关系都极低（空白 prompt），默认为 "比"
  const max = profile.reduce((a, b) => (a.score >= b.score ? a : b));
  if (max.score < 0.5) return "比";
  return max.key;
}

// 记忆流时间线：取最近 N 个 engram，把它们的关系分布摊平
export interface MemoryStreamEntry {
  index: number; // 0 = 最新
  self: string;
  timestamp: number;
  distribution: Record<RelationKey, number>; // 归一化为 0..100
}

export function memoryStream(limit = 8): MemoryStreamEntry[] {
  const all = getAllEngrams();
  const keys = getRelationKeys();
  const out: MemoryStreamEntry[] = [];
  for (let i = 0; i < Math.min(limit, all.length); i++) {
    const e = all[i];
    const distribution = {} as Record<RelationKey, number>;
    let sum = 0;
    for (const k of keys) {
      const val = (e.relations[k] || []).length;
      distribution[k] = val;
      sum += val;
    }
    // 归一化到 100%
    if (sum > 0) {
      for (const k of keys) {
        distribution[k] = Math.round((distribution[k] / sum) * 100);
      }
    } else {
      for (const k of keys) distribution[k] = 0;
    }
    out.push({
      index: i,
      self: e.self,
      timestamp: e.timestamp,
      distribution,
    });
  }
  return out;
}

// ======================================================================
// 方向 3：Harness 语义路由 —— 不同的主导关系 → 不同的 Prompt 倾向
// ======================================================================
//
// 思路：不是"一个 prompt 应对一切"，而是让 LLM 以不同的"认知姿态"
// 去处理不同的请求。当 prompt 的主导关系是"克"时，LLM 应该更关心
// 边界和验证；当主导关系是"生"时，LLM 应该更倾向于可视化输出。
//
// 每个关系键有一个简短的 "cognitive bias" 段落，注入到 SYSTEM_PROMPT 中。
// 注意：这是在 "buildEngramContext" 之外的另一层注入——两层是叠加的：
//   SYSTEM_PROMPT + harnessBias + engramContext → LLM

export interface HarnessRoute {
  key: RelationKey;
  label: string;       // 用于 UI 展示
  bias: string;        // 注入到 system prompt 的一段话
}

const HARNESS_ROUTES: Record<RelationKey, HarnessRoute> = {
  印: {
    key: "印",
    label: "Support-oriented — 先想依赖与基石",
    bias:
      "COGNITIVE BIAS: This request is primarily about FOUNDATION & DEPENDENCIES. Prioritize: (1) identify which React hooks or libraries provide the backbone, (2) keep the import surface minimal, (3) ensure state flows from foundation to display. Write fewer helper files, more focused core components.",
  },
  生: {
    key: "生",
    label: "Output-oriented — 先想渲染与可视化",
    bias:
      "COGNITIVE BIAS: This request is primarily about OUTPUT & RENDERING. Prioritize: (1) visual hierarchy and clear layout, (2) animations or transitions for interactivity, (3) component composition that reads naturally top-down. If the request implies charts or lists, lean into them.",
  },
  比: {
    key: "比",
    label: "Peer-oriented — 从同类结构出发",
    bias:
      "COGNITIVE BIAS: This request is primarily about COMPOSITION & PATTERNS. Prioritize: (1) reuse familiar UI primitives (buttons, cards, tabs, forms) compositionally, (2) keep interaction patterns consistent, (3) avoid inventing new patterns when standard ones suffice.",
  },
  克: {
    key: "克",
    label: "Control-oriented — 以约束为骨架",
    bias:
      "COGNITIVE BIAS: This request is primarily about CONTROL & VALIDATION. Prioritize: (1) define clear constraints (input length, required fields, numeric ranges) upfront, (2) show error/empty states explicitly, (3) disable actions when preconditions are not met, (4) treat edge cases as first-class concerns, not afterthoughts.",
  },
  财: {
    key: "财",
    label: "Data-oriented — 从数据消费出发",
    bias:
      "COGNITIVE BIAS: This request is primarily about DATA TRANSFORMATION. Prioritize: (1) define the shape of input data early (types, example data), (2) keep data-to-display pipeline simple and traceable, (3) think about loading and empty states as first-class rendering outputs.",
  },
};

// 给 harness 路由添加一个 "fallback"——当所有关系都很弱时，保持中立
const NEUTRAL_BIAS =
  "COGNITIVE BIAS: The request is evenly balanced. Produce a pragmatic, balanced React component with reasonable defaults.";

// 解析 prompt → 选择路由 → 返回注入文本
export function buildHarnessBias(prompt: string): { route: HarnessRoute; text: string } {
  const k = dominantRelation(prompt);
  const route = HARNESS_ROUTES[k];
  return { route, text: route.bias };
}

// 中性路由（当 prompt 为空或信号太弱时）
export function neutralHarnessText(): string {
  return NEUTRAL_BIAS;
}

// 暴露路由表给 UI（让用户能看到"这次请求走了哪条路"）
export function getHarnessRoutes(): HarnessRoute[] {
  return Object.values(HARNESS_ROUTES);
}

// ======================================================================
// 方向 2：学习反馈 — engage() 把用户的正向交互转化为 engram 信号积分
// ======================================================================
//
// 当用户复制代码、下载 ZIP、或重新渲染（revisit）时调用。
// 信号分数是累加的整数，用于共振排名的加权。

const ENGAGEMENT_WEIGHTS: Record<EngagementType, number> = {
  copy: 3,     // 复制代码 — 最强信号
  download: 4, // 下载项目 — 更强信号
  view: 1,     // 查看/生成 — 弱信号
  revisit: 2,  // 重访（被共振后重新生成）— 中等信号
};

export function engageEngram(
  engramId: string,
  type: EngagementType,
): { success: boolean; newScore: number } {
  if (typeof window === "undefined") return { success: false, newScore: 0 };
  const store = loadEngramStore();
  const target = store.engrams.find((e) => e.id === engramId);
  if (!target) return { success: false, newScore: 0 };

  const weight = ENGAGEMENT_WEIGHTS[type] ?? 1;
  target.signalScore = (target.signalScore || 0) + weight;
  if (!target.signals) target.signals = {};
  target.signals[type] = ((target.signals[type] || 0) + 1);

  // revisit (回头看) 额外标记 artifacts，方便在 EngramGraph 中以"回头看"区分
  if (type === "revisit") {
    if (!target.artifacts) target.artifacts = {};
    target.artifacts["retro"] = (target.artifacts["retro"] || 0) + 1;
  }

  buildIndex(store);
  saveEngramStore(store);
  return { success: true, newScore: target.signalScore };
}

// 找到最新的 engram（当前刚生成的那个）——供 UI 一键标记 engage
export function getLatestEngram(): Engram | null {
  const store = loadEngramStore();
  return store.engrams[0] || null;
}

// ======================================================================
// 方向 1：多路生成 — 同时选前 2 条主导关系，产出 primary+secondary bias
// ======================================================================
//
// 替代原先的 buildHarnessBias：不只选一个最强关系，而是让 LLM
// "同时考虑两个正交的认知姿态"，primary 权重高，secondary 权重低。
// 当 prompt 的信号向量高度单一时，secondary 自动退化为一个小的"反向约束"
// （如：如果 primary 是 "data-oriented"，secondary 是 "control-oriented"，
//  LLM 会同时考虑数据与约束，产生更稳的代码）。

export interface DualBias {
  primary: HarnessRoute;
  secondary: HarnessRoute | null;
  text: string; // 可直接注入到 system prompt 的段落
}

// 返回按激活分数排序的前 N 个关系键及分数
function rankedRelationKeys(prompt: string): { key: RelationKey; score: number }[] {
  const profile = relationProfile(prompt);
  // 用原始 score（非百分比）做排序，避免 sum 为 0 时的噪声
  const rawScores: { key: RelationKey; score: number }[] = [];
  const lower = prompt.toLowerCase();
  for (const k of getRelationKeys()) {
    const tokens = TRIGGER_TOKENS[k] || [];
    let s = 0;
    for (const t of tokens) {
      if (/[\u4e00-\u9fa5]/.test(t)) {
        if (lower.includes(t.toLowerCase())) s += 1;
      } else {
        const re = new RegExp(`\\b${t.toLowerCase()}\\b`, "g");
        const m = lower.match(re);
        if (m) s += m.length;
      }
    }
    rawScores.push({ key: k, score: s });
  }
  return rawScores.sort((a, b) => b.score - a.score);
}

export function buildDualHarnessBias(prompt: string): DualBias {
  const ranked = rankedRelationKeys(prompt);
  const routes = getHarnessRoutes();

  // primary：激活分最高的关系键
  const primaryKey = ranked[0].key;
  const primary = routes.find((r) => r.key === primaryKey) || routes[0];

  // secondary：激活分第二高的关系键（必须与 primary 不同，且分数 > 0.3 × primary）
  let secondary: HarnessRoute | null = null;
  const primaryScore = ranked[0].score || 1;
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i].key !== primaryKey && ranked[i].score >= 0.3 * primaryScore) {
      secondary = routes.find((r) => r.key === ranked[i].key) || null;
      break;
    }
  }

  // 组合段落：primary 为主要 cognitive bias，secondary 为 "also keep in mind"
  const primarySection = primary.bias;
  const secondarySection = secondary
    ? `${secondary.bias.replace("PRIMARY", "SECONDARY")} (secondary — weighted ~60% of primary)`
    : "";
  const text = secondarySection
    ? `${primarySection}\n\n${secondarySection}`
    : primarySection;

  return { primary, secondary, text };
}

// ======================================================================
// 方向 3：跨 engram 传播图 — engram × engram 相似度矩阵 + 布局坐标
// ======================================================================
//
// 思路：把每个 engram 表示为一个 5 维向量（每个关系键的 token 数），
// 用余弦相似度计算每对 engram 的相关性。然后用一个"环形+吸引力"
// 的近似力导向布局（不做物理模拟，按极坐标 + 相似度偏置）得到可视化坐标。

export interface GraphNode {
  id: string;
  self: string;
  x: number; // 归一化到 [0,1]
  y: number;
  radius: number;   // 点大小：与 signalScore + 关系总数正相关
  timestamp: number;
  signalScore: number;
  dominantRelation: RelationKey; // 取关系键中 token 数最多的那个
  // 回头看次数（来自 artifacts.retro）
  retro: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  similarity: number; // 0..1
}

export interface EngramGraph {
  nodes: GraphNode[];
  edges: GraphEdge[]; // 只保留相似度 >= minSimilarity 的边
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function engramToVector(e: Engram): number[] {
  const keys = getRelationKeys();
  return keys.map((k) => (e.relations[k] || []).length);
}

function dominantRelationOf(e: Engram): RelationKey {
  const keys = getRelationKeys();
  let best: RelationKey = "比";
  let bestCount = 0;
  for (const k of keys) {
    const c = (e.relations[k] || []).length;
    if (c > bestCount) {
      bestCount = c;
      best = k;
    }
  }
  return best;
}

export function computeEngramGraph(
  minSimilarity = 0.35,
  maxEdgesPerNode = 3,
): EngramGraph {
  const store = loadEngramStore();
  const engrams = store.engrams;
  if (engrams.length === 0) return { nodes: [], edges: [] };

  // 计算每对 engram 的余弦相似度
  const vectors = engrams.map(engramToVector);
  const simMatrix: number[][] = engrams.map(() => new Array(engrams.length).fill(0));
  for (let i = 0; i < engrams.length; i++) {
    for (let j = i + 1; j < engrams.length; j++) {
      const s = cosineSimilarity(vectors[i], vectors[j]);
      simMatrix[i][j] = s;
      simMatrix[j][i] = s;
    }
  }

  // 节点布局：环形 + 基于"与全局平均向量的差异"做轻微径向往复
  // 这样相似的 engram 会聚集在一起，而不像纯环形那样无结构。
  const n = engrams.length;
  const meanVec = new Array(5).fill(0).map((_, idx) =>
    vectors.reduce((acc, v) => acc + v[idx], 0) / n,
  );
  // 每个节点的 "outlier 分数" = 与均值向量的余弦距离
  const outlier = vectors.map((v) => 1 - cosineSimilarity(v, meanVec));

  const nodes: GraphNode[] = engrams.map((e, i) => {
    // 基础极角：按时间顺序（index）排开
    const angle = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
    // 离群者稍微外推一点，近邻者稍微内收
    const baseR = 0.42;
    const r = baseR + outlier[i] * 0.12;
    const x = 0.5 + r * Math.cos(angle);
    const y = 0.5 + r * Math.sin(angle);
    const relationTotal = Object.values(e.relations).reduce(
      (acc, v) => acc + (Array.isArray(v) ? v.length : 0),
      0,
    );
    const radius = 0.04 + Math.min(0.1, relationTotal * 0.005 + (e.signalScore || 0) * 0.008);
    return {
      id: e.id,
      self: e.self,
      x,
      y,
      radius,
      timestamp: e.timestamp,
      signalScore: e.signalScore || 0,
      dominantRelation: dominantRelationOf(e),
      retro: (e.artifacts?.retro as unknown as number) || 0,
    };
  });

  // 边：对每个节点，取 top-N 相似度最高的邻居
  const edges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    const candidates: { j: number; s: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (simMatrix[i][j] >= minSimilarity) {
        candidates.push({ j, s: simMatrix[i][j] });
      }
    }
    candidates.sort((a, b) => b.s - a.s);
    const top = candidates.slice(0, maxEdgesPerNode);
    for (const { j, s } of top) {
      // 避免重复边：小 index 在前
      const src = Math.min(i, j);
      const dst = Math.max(i, j);
      if (edges.some((e) => e.source === engrams[src].id && e.target === engrams[dst].id)) continue;
      edges.push({
        source: engrams[src].id,
        target: engrams[dst].id,
        similarity: s,
      });
    }
  }

  return { nodes, edges };
}
