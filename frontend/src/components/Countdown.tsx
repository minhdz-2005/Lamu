"use client";

import { useEffect, useRef, useState } from "react";

import { formatCountdown, msLeft } from "@/lib/format";

/** Đếm ngược 1 giây/lần, tự dừng ở 0 và báo một lần (00 §6). */
export function Countdown({ target, onElapsed }: { target: string; onElapsed?: () => void }) {
  const [remaining, setRemaining] = useState(() => msLeft(target));
  const elapsed = useRef(onElapsed);
  elapsed.current = onElapsed;

  useEffect(() => {
    let fired = false;
    setRemaining(msLeft(target));
    const timer = window.setInterval(() => {
      const left = msLeft(target);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(timer);
        if (!fired) {
          fired = true;
          elapsed.current?.();
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  return (
    <span className="countdown" aria-live="off">
      còn {formatCountdown(remaining)}
    </span>
  );
}
