"use client";
import { createContext, useContext } from "react";
import type { Mode } from "./geo";
import { HAS_METRO } from "./transit";
import { useStored } from "./useStored";

/** How the visitor is travelling. Shared by every page and remembered on this phone. */
export const MODES: { id: Mode; icon: string; en: string; bn: string; per: { en: string; bn: string } }[] = [
  { id: "walk", icon: "🚶", en: "Walk", bn: "হাঁটা", per: { en: "walk", bn: "হাঁটা" } },
  { id: "bike", icon: "🏍️", en: "Bike", bn: "বাইক", per: { en: "by bike", bn: "বাইকে" } },
  { id: "car", icon: "🚗", en: "Car / taxi", bn: "গাড়ি / ট্যাক্সি", per: { en: "by car", bn: "গাড়িতে" } },
  { id: "metro", icon: "🚇", en: "Metro", bn: "মেট্রো", per: { en: "by metro", bn: "মেট্রোতে" } },
];
/** Metro is only offered when data/transit.json has stations. */
export const AVAILABLE_MODES = MODES.filter((m) => m.id !== "metro" || HAS_METRO);
const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "walk", setMode: () => {} });
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [stored, setMode] = useStored<Mode>("ph-mode", "walk");
  const mode: Mode = stored === "metro" && !HAS_METRO ? "walk" : stored;
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}
export const useMode = () => useContext(Ctx);
export const modeInfo = (m: Mode) => MODES.find((x) => x.id === m) ?? MODES[0];
