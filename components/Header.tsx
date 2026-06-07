import Link from "next/link";
import GithubIcon from "./github-icon";

export default function Header() {
  return (
    <header className="flex items-center justify-between w-full px-6 py-4 bg-neutral-950 border-b border-neutral-800">
      <Link href="/" className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Pages AI DeepSeek V4
        </h1>
      </Link>
      <a
        href="https://github.com/TencentEdgeOne/deepseek-v4"
        target="_blank"
        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-white text-black rounded-full hover:bg-neutral-200 transition-colors duration-200"
      >
        <GithubIcon className="w-4 h-4" />
        <span>Deploy to Pages</span>
      </a>
    </header>
  );
}
