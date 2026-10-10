"use client";
import { createContext, useContext } from "react";
import { Lang } from "./i18n";
import { useStored } from "./useStored";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useStored<Lang>("ph-lang", "en");
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
