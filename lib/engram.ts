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
}

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
    return { engram: e, score, sharedRelations: shared };
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
