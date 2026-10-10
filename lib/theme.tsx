"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({ theme: "light", setTheme: () => {}, toggle: () => {} });
const apply = (t: Theme) => { document.documentElement.dataset.theme = t; document.documentElement.style.colorScheme = t; };

/** One shared theme for the whole app, so the header toggle and the Home "Night mode" button always agree. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setT] = useState<Theme>("light");
  useEffect(() => {
    let t: Theme = "light";
    try { const s = localStorage.getItem("ph-theme"); t = s ? JSON.parse(s) : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch {}
    if (t !== "dark") t = "light";
    setT(t); apply(t);
  }, []);
  const setTheme = (t: Theme) => { setT(t); apply(t); try { localStorage.setItem("ph-theme", JSON.stringify(t)); } catch {} };
  return <Ctx.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
