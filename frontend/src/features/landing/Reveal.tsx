"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cx } from "@/components/ui";

/** Hiện dần khi nội dung đi vào viewport; CSS lo phần chuyển động. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cx("reveal", className)} data-visible={visible} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
