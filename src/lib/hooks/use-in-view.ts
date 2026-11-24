"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the element has entered the viewport (sticky: it never flips back). Used to load the
 * heading font of a gallery card only when it is about to be seen (plan §8). Without
 * `IntersectionObserver` it reports true from the start.
 */
export function useInView<T extends Element>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  // Without IntersectionObserver (very old browsers, some test runners) nothing is deferred.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
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
