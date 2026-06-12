import { animate, AnimationOptions } from "framer-motion";
import { useRef } from "react";

type ScrollOptions = AnimationOptions & { delay?: number };

export function useScrollTo() {
  const ref = useRef<HTMLDivElement>(null);

  function scrollTo(options: ScrollOptions = {}) {
    if (!ref.current) return;

    const defaultOptions: ScrollOptions = {
      type: "spring",
      bounce: 0,
      duration: 0.6,
    };

    animate(window.scrollY, ref.current.offsetTop, {
      ...defaultOptions,
      ...options,
      onUpdate: (latest) => window.scrollTo({ top: latest as number }),
    });
  }

  return [ref, scrollTo] as const;
}
