"use client";
import { useEffect, useState } from "react";

/** useState that survives refresh via localStorage. Safe if storage is blocked. */
export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) setV(JSON.parse(s)); } catch {}
  }, [key]);
  const set = (nv: T) => { setV(nv); try { localStorage.setItem(key, JSON.stringify(nv)); } catch {} };
  return [v, set] as const;
}
