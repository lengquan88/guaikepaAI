import Link from "next/link";
import { SparklesIcon } from "@heroicons/react/20/solid";
import GithubIcon from "./github-icon";

export default function Header() {
  return (
    <header className="flex items-center justify-between w-full px-6 py-4 bg-neutral-950 border-b border-neutral-800/60">
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-500/20 group-hover:from-indigo-500/40 group-hover:to-purple-500/40 transition-colors">
          <SparklesIcon className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-bold tracking-tight text-white">
            DeepSeek V4 Playground
          </h1>
          <span className="text-xs text-neutral-500 leading-none">
            Generate full-stack apps with one prompt
          </span>
        </div>
      </Link>
      <a
        href="https://github.com/TencentEdgeOne/deepseek-v4"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white text-black rounded-full hover:bg-neutral-200 transition-colors duration-200 shadow-sm shadow-white/5"
      >
        <GithubIcon className="w-4 h-4" />
        <span>Deploy to Pages</span>
      </a>
    </header>
  );
}
