export default function Footer() {
  return (
    <footer className="border-t border-neutral-800/60 bg-neutral-950 py-3 text-center text-xs text-neutral-500">
      <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>
          &copy; {new Date().getFullYear()} DeepSeek V4 Playground. Powered by
          <a
            href="https://pages.edgeone.ai/" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-white transition-colors"> EdgeOne Pages
          </a>.
        </p>
        <div className="flex items-center gap-4">
          <a href="https://deepseek.ai/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">DeepSeek</a>
          <span className="text-neutral-700">|</span>
          <a href="https://github.com/TencentEdgeOne/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
