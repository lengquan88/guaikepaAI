"use client";

import CodeViewer from "@/components/code-viewer";
import { useScrollTo } from "@/hooks/use-scroll-to";
import { CheckIcon } from "@heroicons/react/16/solid";
import { ChevronDownIcon, SparklesIcon } from "@heroicons/react/20/solid";
import * as Select from "@radix-ui/react-select";
import { FormEvent, useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import LoadingDots from "../../components/loading-dots";

const EXAMPLE_PROMPTS = [
  { label: "Landing page", value: "Build a modern product landing page with a hero section, feature list, and call-to-action button. Use Tailwind for styling." },
  { label: "To-do app", value: "Create a beautiful to-do list app with add, delete, and mark-complete functionality. Include task filtering and clean animations." },
  { label: "Data dashboard", value: "Create an analytics dashboard showing charts and key metrics. Use recharts for charting and Tailwind for layout." },
  { label: "Pricing page", value: "Build a pricing comparison page with three tiers, feature list, FAQ section, and prominent call-to-action buttons." },
  { label: "Contact form", value: "Create a contact form with name, email, message fields, validation, and a success message after submission." },
];

// Model mapping: display name -> API model name
const MODEL_MAP: Record<string, string> = {
  "deepseek-v4": "@tx/deepseek-ai/deepseek-v4",
};

const SYSTEM_PROMPT = `You are an expert frontend React/TypeScript engineer. Follow these rules strictly:

CRITICAL RULES:
- Return ONLY valid, compilable code - no syntax errors allowed
- Return ONLY code, no explanations, no markdown, no backticks
- Use default export for the component
- Keep code concise and minimal
- Double-check all syntax before returning

TECHNICAL REQUIREMENTS:
- IMPORTANT: Always import hooks explicitly: import { useState, useEffect } from "react"
- DO NOT use React.useState or import React from "react" - always use named imports for hooks
- Use Tailwind CSS for styling (no arbitrary values like h-[600px])
- Make components interactive with proper state management
- No required props - component must work standalone

LIBRARIES AVAILABLE:
- recharts: Only for charts/dashboards (import { LineChart, XAxis, ... } from "recharts")
- For placeholder images: <div className="w-16 h-16 bg-gray-200 border-2 border-dashed rounded-xl" />

NO OTHER LIBRARIES (zod, hookform, etc.) ARE AVAILABLE.

Please ONLY return code, NO backticks or language names.
`;

function removeCodeFormatting(code: string): string {
  return code
    .replace(/```(?:typescript|javascript|tsx)?\n([\s\S]*?)```/g, "$1")
    .trim();
}

// Auto-fix common React hooks import issues
function fixReactImports(code: string): string {
  // Detect which hooks are used
  const hooksUsed: string[] = [];
  const hookPatterns = [
    'useState', 'useEffect', 'useCallback', 'useMemo', 
    'useRef', 'useContext', 'useReducer', 'useLayoutEffect'
  ];
  
  for (const hook of hookPatterns) {
    // Check if this hook is used (as a function call)
    const hookRegex = new RegExp(`\\b${hook}\\s*[<(]`, 'g');
    if (hookRegex.test(code)) {
      hooksUsed.push(hook);
    }
  }
  
  if (hooksUsed.length === 0) {
    return code;
  }
  
  // Check if these hooks are already correctly imported
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']react["']/;
  const importMatch = code.match(importRegex);
  
  if (importMatch) {
    // Already has named import, check if all required hooks are included
    const existingImports = importMatch[1].split(',').map(s => s.trim());
    const missingHooks = hooksUsed.filter(h => !existingImports.includes(h));
    
    if (missingHooks.length > 0) {
      const newImports = [...existingImports, ...missingHooks].join(', ');
      code = code.replace(importRegex, `import { ${newImports} } from "react"`);
    }
  } else {
    // Check if there is import React from "react" but no hooks
    const defaultImportRegex = /import\s+React\s+from\s+["']react["']\s*;?/;
    if (defaultImportRegex.test(code)) {
      // Replace with import containing hooks
      code = code.replace(
        defaultImportRegex, 
        `import React, { ${hooksUsed.join(', ')} } from "react";`
      );
    } else {
      // No React import, add one
      code = `import { ${hooksUsed.join(', ')} } from "react";\n${code}`;
    }
  }
  
  return code;
}

export default function Home() {
  const DEFAULT_PROMPT = "Build a personal homepage";
  const MAX_PROMPT_LENGTH = 4000; // Client-side guard; also enforced by the API

  let [status, setStatus] = useState<
    "initial" | "creating" | "created" | "updating" | "updated"
  >("initial");
  let [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  let models = [
    { label: "deepseek-v4", value: "deepseek-v4" },
  ];
  let [model, setModel] = useState(models[0].value);
  let [generatedCode, setGeneratedCode] = useState("");
  let [ref, scrollTo] = useScrollTo();
  let [messages, setMessages] = useState<{ role: string; content: string }[]>(
    [],
  );
  // Accumulated user input history for multi-turn conversation
  let [conversationHistory, setConversationHistory] = useState<string[]>([]);
  // Resolve SSR hydration flickering issue
  let [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  let loading = status === "creating" || status === "updating";

  async function createApp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!prompt.trim()) return;

    if (prompt.length > MAX_PROMPT_LENGTH) {
      toast.error(`Prompt too long (${prompt.length} > ${MAX_PROMPT_LENGTH} characters).`);
      setStatus("initial");
      return;
    }

    const MAX_COMBINED_LENGTH = 12000;
    const newHistory = [...conversationHistory, prompt];
    const combinedUserMessage = newHistory.join("");

    if (combinedUserMessage.length > MAX_COMBINED_LENGTH) {
      toast.error(
        `Accumulated conversation too long (${combinedUserMessage.length} > ${MAX_COMBINED_LENGTH} characters). Start a new conversation to continue.`
      );
      setStatus("initial");
      return;
    }

    if (status !== "initial") {
      scrollTo({ delay: 0.5 });
    }

    setStatus("creating");
    setGeneratedCode("");

    const fullMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: combinedUserMessage },
    ];

    // Convert display name to API model name
    const apiModel = MODEL_MAP[model] || model;

    // Call OpenAI standard API directly
    const url =
      process.env.NODE_ENV === "development"
        ? "https://deepseek-v4.edgeone.site/v1/chat/completions"
        : "/v1/chat/completions";

    let res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: apiModel,
        messages: fullMessages,
        stream: true,
      }),
    });

    if (!res.ok) {
      // Try to parse error response JSON
      try {
        const errorData = await res.json();
        const errorMsg = errorData.error || errorData.message || res.statusText;
        toast.error(errorMsg);
        setStatus("initial");
        return;
      } catch {
        toast.error(res.statusText);
        setStatus("initial");
        return;
      }
    }

    if (!res.body) {
      toast.error("No response body");
      setStatus("initial");
      return;
    }

    // Check response type, if not SSE stream, it might be a JSON error
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const errorData = await res.json();
        const errorMsg = errorData.error || errorData.message || "Unknown error";
        toast.error(errorMsg);
        setStatus("initial");
        return;
      } catch {
        toast.error("Failed to parse error response");
        setStatus("initial");
        return;
      }
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    let receivedData = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || "";
            if (content) {
              receivedData += content;
              const cleanedData = removeCodeFormatting(receivedData);
              setGeneratedCode(cleanedData);
            }
          } catch {}
        }
      }
    }

    // Handle remaining buffer
    if (buffer.startsWith("data: ")) {
      const data = buffer.slice(6).trim();
      if (data && data !== "[DONE]") {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || "";
          if (content) {
            receivedData += content;
            const cleanedData = removeCodeFormatting(receivedData);
            setGeneratedCode(cleanedData);
          }
        } catch {}
      }
    }

    // Final processing: fix React imports
    const finalCode = fixReactImports(removeCodeFormatting(receivedData));
    setGeneratedCode(finalCode);

    // Update conversation history
    setConversationHistory(newHistory);
    setMessages([...messages, { role: "user", content: prompt }]);
    setPrompt("");
    setStatus("created");
    toast.success("Code generated successfully!");
  }

  // Clear conversation context
  function clearConversation() {
    setConversationHistory([]);
    setMessages([]);
    setGeneratedCode("");
    setStatus("initial");
    setPrompt(DEFAULT_PROMPT);
    toast.success("Started a new conversation");
  }

  useEffect(() => {
    let el = document.querySelector(".cm-scroller");
    if (el && loading) {
      let end = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: end });
    }
  }, [loading, generatedCode]);

  return (
    <>
    <main className="flex flex-1 overflow-hidden">
      {/* Left chat area */}
      <div className="relative flex flex-col w-1/3 min-w-[400px] bg-neutral-950 shadow-[inset_-8px_0_16px_-8px_rgba(0,0,0,0.5)]">
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Chat history */}
          <div className="space-y-4">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center text-center py-10">
                <div className="w-14 h-14 mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                  <SparklesIcon className="w-7 h-7 text-indigo-400" />
                </div>
                <h3 className="text-base font-medium text-neutral-200 mb-1">
                  Describe what you want to build
                </h3>
                <p className="text-sm text-neutral-500 max-w-sm">
                  Enter a prompt below and DeepSeek V4 will generate a complete, runnable React component.
                </p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg ${
                  msg.role === "user"
                    ? "bg-neutral-900/50 border border-neutral-700/30 ml-8"
                    : "bg-neutral-800/50 border border-neutral-700/30 mr-8"
                }`}
              >
                <p className="text-sm text-gray-300">{msg.content}</p>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 p-4 text-gray-400">
                <LoadingDots color="white" style="large" />
                <span>Generating code...</span>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-neutral-800/40">
          {messages.length === 0 && !loading && (
            <div className="flex flex-wrap gap-2 mb-3">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => setPrompt(example.value)}
                  className="px-2.5 py-1.5 text-[11px] text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-md hover:text-white hover:border-neutral-600 transition-colors"
                >
                  {example.label}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={createApp}>
            <div className="relative">
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                maxLength={MAX_PROMPT_LENGTH}
                name="prompt"
                className="w-full px-4 py-3 text-sm text-white placeholder-neutral-600 bg-neutral-900/50 border border-neutral-700/40 resize-none rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-600/50 focus:border-neutral-600/50 disabled:opacity-50"
                placeholder="Describe the app you want to build..."
              />
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  {isMounted ? (
                    <Select.Root
                      name="model"
                      disabled={loading}
                      value={model}
                      onValueChange={setModel}
                    >
                      <Select.Trigger className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 bg-neutral-900/50 border border-neutral-700/40 rounded-lg hover:bg-neutral-800/50 focus:outline-none focus:ring-1 focus:ring-neutral-600/50">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDownIcon className="w-4 h-4" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden bg-neutral-900 border border-neutral-700/40 rounded-lg shadow-xl">
                          <Select.Viewport className="p-1">
                            {models.map((m) => (
                              <Select.Item
                                key={m.value}
                                value={m.value}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 rounded cursor-pointer outline-none hover:bg-neutral-800/70 data-[highlighted]:bg-neutral-800/70"
                              >
                                <Select.ItemText>{m.label}</Select.ItemText>
                                <Select.ItemIndicator className="ml-auto">
                                  <CheckIcon className="w-4 h-4 text-white" />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 bg-neutral-900/50 border border-neutral-700/40 rounded-lg">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      <span>{models[0].label}</span>
                      <ChevronDownIcon className="w-4 h-4" />
                    </div>
                  )}
                  {conversationHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={clearConversation}
                      disabled={loading}
                      className="px-3 py-2 text-xs text-neutral-400 bg-neutral-900/50 border border-neutral-700/40 rounded-lg hover:bg-red-900/30 hover:border-red-700/40 hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-neutral-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="px-4 py-2 text-sm font-medium text-black transition-colors bg-white rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Middle divider */}
      <div className="w-px bg-neutral-800" />

      {/* Right code display area */}
      <div className="flex-1 overflow-hidden bg-black" ref={ref}>
        {status === "initial" ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-8">
              <div className="mb-4 text-6xl text-neutral-700">{"</>"}</div>
              <h3 className="text-lg font-medium text-neutral-300 mb-2">
                Ready to generate code
              </h3>
              <p className="text-sm text-neutral-500">
                Your generated code will appear here with a live preview once you enter a prompt on the left.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full">
            <CodeViewer code={generatedCode} showEditor isGenerating={loading} />
          </div>
        )}
      </div>
    </main>
    <Toaster
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: "#0a0a0a",
          border: "1px solid #262626",
          color: "#e5e5e5",
        },
      }}
    />
    </>
  );
}
