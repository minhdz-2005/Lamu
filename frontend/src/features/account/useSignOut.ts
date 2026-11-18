"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readSession } from "@/lib/auth";
import type { Session } from "@/lib/useSession";

export function useSignOut({
  generation,
  logout,
}: Pick<Session, "generation" | "logout">) {
  const router = useRouter();
  const pending = useRef(false);
  const redirecting = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [feedback, setFeedback] = useState<{
    generation: string;
    text: string;
  } | null>(null);
  const notice =
    feedback?.generation === generation ? feedback.text : undefined;

  async function signOut() {
    if (pending.current || readSession().generation !== generation) return;
    pending.current = true;
    setLoggingOut(true);
    try {
      const result = await logout();
      const current = readSession();
      if (current.access || current.refresh) return;
      if (result === "confirmed") {
        redirecting.current = true;
        router.replace("/auth");
      }
      if (result === "local-cleared")
        setFeedback({
          generation: current.generation,
          text: "Đã kết thúc phiên trên trình duyệt này. Chưa xác nhận được việc thu hồi phiên trên máy chủ.",
        });
    } catch {
      if (readSession().generation === generation)
        setFeedback({
          generation,
          text: "Chưa thể đăng xuất. Vui lòng thử lại.",
        });
    } finally {
      pending.current = false;
      setLoggingOut(false);
    }
  }

  return { signOut, loggingOut, notice, redirecting };
}
