import { animate } from "framer-motion";
import { useRef } from "react";

type ScrollOptions = { type?: string; bounce?: number; duration?: number; delay?: number };

export function useScrollTo() {
  const ref = useRef<HTMLDivElement>(null);

  function scrollTo(options: ScrollOptions = {}) {
    if (!ref.current) return;

    const defaultOptions = {
      type: "spring",
      bounce: 0,
      duration: 0.6,
    };

    animate(window.scrollY, ref.current.offsetTop, {
      ...defaultOptions,
      ...options,
      onUpdate: (latest: number) => window.scrollTo({ top: latest }),
    });
  }

  return [ref, scrollTo] as const;
}
