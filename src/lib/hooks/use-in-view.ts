"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the element has entered the viewport (sticky: it never flips back). Used to load the
 * heading font of a gallery card only when it is about to be seen (plan §8). Without
 * `IntersectionObserver` it turns true right after mount.
 */
export function useInView<T extends Element>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  // Always false on the server and on first client render, so SSR never asks for the font.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer (very old browsers): show everything, but after the first paint.
      const id = setTimeout(() => setInView(true), 0);
      return () => clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
