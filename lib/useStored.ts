"use client";
import { useEffect, useState } from "react";

/** useState that survives refresh via localStorage. Safe if storage is blocked.
 *  Re-reads when a "ph-sync" event fires (after cloud data is merged in). onSet lets callers push changes elsewhere. */
export function useStored<T>(key: string, initial: T, onSet?: (v: T) => void) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    const read = () => { try { const s = localStorage.getItem(key); if (s) setV(JSON.parse(s)); } catch {} };
    read();
    window.addEventListener("ph-sync", read);
    return () => window.removeEventListener("ph-sync", read);
  }, [key]);
  const set = (nv: T) => { setV(nv); try { localStorage.setItem(key, JSON.stringify(nv)); } catch {} onSet?.(nv); };
  return [v, set] as const;
}
