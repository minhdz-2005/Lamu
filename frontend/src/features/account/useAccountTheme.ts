"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

export function useAccountTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(readTheme()), []);
  const toggleTheme = () => {
    const next = readTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggleTheme };
}
