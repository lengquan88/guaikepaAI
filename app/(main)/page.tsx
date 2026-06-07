"use client";

import CodeViewer from "@/components/code-viewer";
import { useScrollTo } from "@/hooks/use-scroll-to";
import { CheckIcon } from "@heroicons/react/16/solid";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import * as Select from "@radix-ui/react-select";
import { FormEvent, useEffect, useState } from "react";
import LoadingDots from "../../components/loading-dots";

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
  const DEFAULT_PROMPT = "Build a personal homepage"

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
  let [errorMessage, setErrorMessage] = useState<string | null>(null);
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

    if (status !== "initial") {
      scrollTo({ delay: 0.5 });
    }

    setStatus("creating");
    setGeneratedCode("");
    setErrorMessage(null);

    // Add current input to history, generate accumulated user message
    const newHistory = [...conversationHistory, prompt];
    const combinedUserMessage = newHistory.join("");

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
        setErrorMessage(errorMsg);
        setStatus("initial");
        return;
      } catch {
        setErrorMessage(res.statusText);
        setStatus("initial");
        return;
      }
    }

    if (!res.body) {
      setErrorMessage("No response body");
      setStatus("initial");
      return;
    }

    // Check response type, if not SSE stream, it might be a JSON error
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const errorData = await res.json();
        const errorMsg = errorData.error || errorData.message || "Unknown error";
        setErrorMessage(errorMsg);
        setStatus("initial");
        return;
      } catch {
        setErrorMessage("Failed to parse error response");
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
  }

  // Clear conversation context
  function clearConversation() {
    setConversationHistory([]);
    setMessages([]);
    setGeneratedCode("");
    setStatus("initial");
    setErrorMessage(null);
    setPrompt(DEFAULT_PROMPT);
  }

  useEffect(() => {
    let el = document.querySelector(".cm-scroller");
    if (el && loading) {
      let end = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: end });
    }
  }, [loading, generatedCode]);

  return (
    <main className="flex flex-1 overflow-hidden">
      {/* Left chat area */}
      <div className="relative flex flex-col w-1/3 min-w-[400px] bg-neutral-950 shadow-[inset_-8px_0_16px_-8px_rgba(0,0,0,0.5)]">
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Chat history */}
          <div className="space-y-4">
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
            {errorMessage && (
              <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50">
                <p className="text-sm text-red-300">{errorMessage}</p>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-neutral-800/40">
          <form onSubmit={createApp}>
            <div className="relative">
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
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
            <div className="text-center">
              <div className="mb-4 text-6xl text-neutral-500">{"</>"}</div>
              <p className="text-lg text-neutral-400">
                Enter a prompt to generate code
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
  );
}
