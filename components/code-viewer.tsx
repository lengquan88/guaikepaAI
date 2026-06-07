"use client";

import * as shadcnComponents from "@/utils/shadcn";
import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { dracula as draculaTheme } from "@codesandbox/sandpack-themes";
import { ArrowDownTrayIcon, CloudArrowUpIcon } from "@heroicons/react/24/outline";
import dedent from "dedent";
import JSZip from "jszip";
import { useEffect, useRef } from "react";
import "./code-viewer.css";

// Auto-run component: automatically trigger run when generation is complete
function AutoRunner({ isGenerating }: { isGenerating: boolean }) {
  const { sandpack } = useSandpack();
  const prevIsGenerating = useRef(isGenerating);

  useEffect(() => {
    // Auto-run when generation changes from generating to completed
    if (prevIsGenerating.current && !isGenerating) {
      sandpack.runSandpack();
    }
    prevIsGenerating.current = isGenerating;
  }, [isGenerating, sandpack]);

  return null;
}

// Download toolbar component
function DownloadToolbar({
  code,
  isGenerating,
}: {
  code: string;
  isGenerating: boolean;
}) {
  const canDownload = !isGenerating && code.trim().length > 0;

  const handleDownload = async () => {
    if (!canDownload) return;

    const zip = new JSZip();

    // Create project structure
    const srcFolder = zip.folder("src");

    // Add main files
    srcFolder?.file("App.tsx", code);
    srcFolder?.file(
      "index.tsx",
      dedent`
      import { StrictMode } from "react";
      import { createRoot } from "react-dom/client";
      import App from "./App";
      import "./index.css";

      const root = createRoot(document.getElementById("root")!);
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    `
    );

    srcFolder?.file(
      "index.css",
      dedent`
      @tailwind base;
      @tailwind components;
      @tailwind utilities;
    `
    );

    // Add root directory index.html (Vite needs index.html in root directory)
    zip.file(
      "index.html",
      dedent`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <link rel="icon" type="image/svg+xml" href="/vite.svg" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Generated App</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="/src/index.tsx"></script>
        </body>
      </html>
    `
    );

    // Add package.json
    zip.file(
      "package.json",
      JSON.stringify(
        {
          name: "generated-app",
          version: "1.0.0",
          private: true,
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
            preview: "vite preview",
          },
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
            "lucide-react": "latest",
            recharts: "^2.9.0",
          },
          devDependencies: {
            "@types/react": "^18.2.0",
            "@types/react-dom": "^18.2.0",
            "@vitejs/plugin-react": "^4.2.0",
            autoprefixer: "^10.4.16",
            postcss: "^8.4.32",
            tailwindcss: "^3.4.0",
            typescript: "^5.3.0",
            vite: "^5.0.0",
          },
        },
        null,
        2
      )
    );

    // Add vite.config.ts
    zip.file(
      "vite.config.ts",
      dedent`
      import { defineConfig } from 'vite'
      import react from '@vitejs/plugin-react'

      export default defineConfig({
        plugins: [react()],
      })
    `
    );

    // Add tsconfig.json
    zip.file(
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: "react-jsx",
            strict: false,
            noUnusedLocals: false,
            noUnusedParameters: false,
            noFallthroughCasesInSwitch: false,
            noImplicitAny: false,
          },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }],
        },
        null,
        2
      )
    );

    // Add tsconfig.node.json
    zip.file(
      "tsconfig.node.json",
      JSON.stringify(
        {
          compilerOptions: {
            composite: true,
            skipLibCheck: true,
            module: "ESNext",
            moduleResolution: "bundler",
            allowSyntheticDefaultImports: true,
          },
          include: ["vite.config.ts"],
        },
        null,
        2
      )
    );

    // Add tailwind.config.js
    zip.file(
      "tailwind.config.js",
      dedent`
      /** @type {import('tailwindcss').Config} */
      export default {
        content: [
          "./index.html",
          "./src/**/*.{js,ts,jsx,tsx}",
        ],
        theme: {
          extend: {},
        },
        plugins: [],
      }
    `
    );

    // Add postcss.config.js
    zip.file(
      "postcss.config.js",
      dedent`
      export default {
        plugins: {
          tailwindcss: {},
          autoprefixer: {},
        },
      }
    `
    );

    // Add README.md
    zip.file(
      "README.md",
      dedent`
      # Generated App

      This project was generated by Pages AI DeepSeek V4.

      ## Getting Started

      1. Install dependencies:
         \`\`\`bash
         npm install
         \`\`\`

      2. Start the development server:
         \`\`\`bash
         npm run dev
         \`\`\`

      3. Build for production:
         \`\`\`bash
         npm run build
         \`\`\`
    `
    );

    // Generate ZIP file and download
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "generated-app.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-gray-800/50">
      <span className="text-sm text-gray-500">Preview</span>
      <div className="flex items-center gap-3">
        <button
          onClick={handleDownload}
          disabled={!canDownload}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
            canDownload
              ? "bg-transparent text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-500 cursor-pointer"
              : "bg-transparent text-gray-600 border border-gray-800 cursor-not-allowed"
          }`}
          title={canDownload ? "Download project ZIP" : "Generating code..."}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
          <span>Download</span>
        </button>
        <a
          href="https://pages.edgeone.ai/document/direct-upload"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
            canDownload
              ? "bg-transparent text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-500 cursor-pointer"
              : "bg-transparent text-gray-600 border border-gray-800 pointer-events-none"
          }`}
          title={canDownload ? "Deploy to EdgeOne Pages" : "Generating code..."}
        >
          <CloudArrowUpIcon className="w-3.5 h-3.5" />
          <span>Publish</span>
        </a>
      </div>
    </div>
  );
}

export default function CodeViewer({
  code,
  showEditor = false,
  isGenerating = false,
}: {
  code: string;
  showEditor?: boolean;
  isGenerating?: boolean;
}) {
  // Header height ~64px, calculate remaining height
  const containerStyle = { height: "calc(100vh - 64px)" };

  return (
    <div style={containerStyle} className="w-full flex flex-col">
      {/* Download toolbar */}
      <DownloadToolbar code={code} isGenerating={isGenerating} />

      <SandpackProvider
        files={{
          "App.tsx": code,
          ...sharedFiles,
        }}
        style={{ height: "100%", display: "flex", flexDirection: "column", flex: 1 }}
        options={{
          ...sharedOptions,
          // Disable auto-run during generation to avoid incomplete code errors
          autorun: !isGenerating,
        }}
        {...sharedProps}
      >
        <AutoRunner isGenerating={isGenerating} />
        {showEditor ? (
          <SandpackLayout style={{ flex: 1, height: "100%" }}>
            <SandpackCodeEditor
              showTabs={false}
              showLineNumbers
              showInlineErrors
              wrapContent
              style={{ height: "100%" }}
            />
            <SandpackPreview
              showNavigator
              showOpenInCodeSandbox={false}
              showRefreshButton
              style={{ height: "100%" }}
            />
          </SandpackLayout>
        ) : (
          <SandpackPreview
            className="flex h-full w-full grow flex-col justify-center p-4 md:pt-16"
            showOpenInCodeSandbox={false}
            showRefreshButton={false}
          />
        )}
      </SandpackProvider>
    </div>
  );
}

let sharedProps = {
  template: "react-ts",
  theme: draculaTheme,
  customSetup: {
    dependencies: {
      "lucide-react": "latest",
      recharts: "2.9.0",
      "react-router-dom": "latest",
      "@radix-ui/react-accordion": "^1.2.0",
      "@radix-ui/react-alert-dialog": "^1.1.1",
      "@radix-ui/react-aspect-ratio": "^1.1.0",
      "@radix-ui/react-avatar": "^1.1.0",
      "@radix-ui/react-checkbox": "^1.1.1",
      "@radix-ui/react-collapsible": "^1.1.0",
      "@radix-ui/react-dialog": "^1.1.1",
      "@radix-ui/react-dropdown-menu": "^2.1.1",
      "@radix-ui/react-hover-card": "^1.1.1",
      "@radix-ui/react-label": "^2.1.0",
      "@radix-ui/react-menubar": "^1.1.1",
      "@radix-ui/react-navigation-menu": "^1.2.0",
      "@radix-ui/react-popover": "^1.1.1",
      "@radix-ui/react-progress": "^1.1.0",
      "@radix-ui/react-radio-group": "^1.2.0",
      "@radix-ui/react-select": "^2.1.1",
      "@radix-ui/react-separator": "^1.1.0",
      "@radix-ui/react-slider": "^1.2.0",
      "@radix-ui/react-slot": "^1.1.0",
      "@radix-ui/react-switch": "^1.1.0",
      "@radix-ui/react-tabs": "^1.1.0",
      "@radix-ui/react-toast": "^1.2.1",
      "@radix-ui/react-toggle": "^1.1.0",
      "@radix-ui/react-toggle-group": "^1.1.0",
      "@radix-ui/react-tooltip": "^1.1.2",
      "class-variance-authority": "^0.7.0",
      clsx: "^2.1.1",
      "date-fns": "^3.6.0",
      "embla-carousel-react": "^8.1.8",
      "react-day-picker": "^8.10.1",
      "tailwind-merge": "^2.4.0",
      "tailwindcss-animate": "^1.0.7",
      vaul: "^0.9.1",
    },
  },
} as const;

let sharedOptions = {
  externalResources: [
    "https://assets.edgeone.site/css/tailwind-ui.min.css",
  ],
};

let sharedFiles = {
  "/index.tsx": dedent`
    import React, { StrictMode } from "react";
    import { createRoot } from "react-dom/client";
    import App from "./App";

    const root = createRoot(document.getElementById("root")!);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  `,
  "/lib/utils.ts": shadcnComponents.utils,
  "/components/ui/accordion.tsx": shadcnComponents.accordian,
  "/components/ui/alert-dialog.tsx": shadcnComponents.alertDialog,
  "/components/ui/alert.tsx": shadcnComponents.alert,
  "/components/ui/avatar.tsx": shadcnComponents.avatar,
  "/components/ui/badge.tsx": shadcnComponents.badge,
  "/components/ui/breadcrumb.tsx": shadcnComponents.breadcrumb,
  "/components/ui/button.tsx": shadcnComponents.button,
  "/components/ui/calendar.tsx": shadcnComponents.calendar,
  "/components/ui/card.tsx": shadcnComponents.card,
  "/components/ui/carousel.tsx": shadcnComponents.carousel,
  "/components/ui/checkbox.tsx": shadcnComponents.checkbox,
  "/components/ui/collapsible.tsx": shadcnComponents.collapsible,
  "/components/ui/dialog.tsx": shadcnComponents.dialog,
  "/components/ui/drawer.tsx": shadcnComponents.drawer,
  "/components/ui/dropdown-menu.tsx": shadcnComponents.dropdownMenu,
  "/components/ui/input.tsx": shadcnComponents.input,
  "/components/ui/label.tsx": shadcnComponents.label,
  "/components/ui/menubar.tsx": shadcnComponents.menuBar,
  "/components/ui/navigation-menu.tsx": shadcnComponents.navigationMenu,
  "/components/ui/pagination.tsx": shadcnComponents.pagination,
  "/components/ui/popover.tsx": shadcnComponents.popover,
  "/components/ui/progress.tsx": shadcnComponents.progress,
  "/components/ui/radio-group.tsx": shadcnComponents.radioGroup,
  "/components/ui/select.tsx": shadcnComponents.select,
  "/components/ui/separator.tsx": shadcnComponents.separator,
  "/components/ui/skeleton.tsx": shadcnComponents.skeleton,
  "/components/ui/slider.tsx": shadcnComponents.slider,
  "/components/ui/switch.tsx": shadcnComponents.switchComponent,
  "/components/ui/table.tsx": shadcnComponents.table,
  "/components/ui/tabs.tsx": shadcnComponents.tabs,
  "/components/ui/textarea.tsx": shadcnComponents.textarea,
  "/components/ui/toast.tsx": shadcnComponents.toast,
  "/components/ui/toaster.tsx": shadcnComponents.toaster,
  "/components/ui/toggle-group.tsx": shadcnComponents.toggleGroup,
  "/components/ui/toggle.tsx": shadcnComponents.toggle,
  "/components/ui/tooltip.tsx": shadcnComponents.tooltip,
  "/components/ui/use-toast.tsx": shadcnComponents.useToast,
  "/public/index.html": dedent`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body {
            background-color: #1e1e2e;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `,
};
