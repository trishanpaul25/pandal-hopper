"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { meters } from "./geo";
import { pushLocation, stopSharing } from "./groups";
import { useStored } from "./useStored";
import type { Point } from "./types";

/** Live location sharing lives here (not in the Groups page) so it keeps running while the person
 *  uses Hop, Pandals or any other page. One GPS watch serves every group that has sharing switched on.
 *  Each group's switch is remembered on this phone as an expiry time, so it turns itself off after SHARE_HOURS. */
export const SHARE_HOURS = 8;
const PREFIX = "ph-share-";
type Me = Point & { heading: number | null };

const readAll = (): Record<string, number> => {
  const o: Record<string, number> = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ""; if (k.startsWith(PREFIX)) { const v = Number(localStorage.getItem(k)); if (v > Date.now()) o[k.slice(PREFIX.length)] = v; } } } catch {}
  return o;
};
let lastUid = "";
/** Switch sharing off everywhere and wipe my last positions. Call this before signing out. */
export async function stopAllSharing() {
  const jobs = Object.keys(readAll()).map((c) => { try { localStorage.removeItem(PREFIX + c); } catch {} return lastUid ? stopSharing(c, lastUid) : Promise.resolve(); });
  window.dispatchEvent(new Event("ph-share"));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 3000))]); // don't hang if offline
}

type Ctx = {
  codes: string[]; isOn: (code: string) => boolean; start: (code: string) => void; stop: (code: string) => void;
  me: Me | null; geoErr: string; keepAwake: boolean; setKeepAwake: (v: boolean) => void;
  /** Ask for my own position on this phone only (e.g. for directions to a friend). Nothing is uploaded unless sharing is on. */
  setLocalTrack: (v: boolean) => void;
};
const C = createContext<Ctx>({ codes: [], isOn: () => false, start: () => {}, stop: () => {}, me: null, geoErr: "", keepAwake: false, setKeepAwake: () => {}, setLocalTrack: () => {} });

export function LiveShareProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const [until, setUntil] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [me, setMe] = useState<Me | null>(null);
  const [geoErr, setGeoErr] = useState("");
  const [localTrack, setLocalTrack] = useState(false);
  const [keepAwake, setKeepAwake] = useStored<boolean>("ph-keep-awake", false);
  const codesRef = useRef<string[]>([]);

  const reload = useCallback(() => setUntil(readAll()), []);
  useEffect(() => { reload(); window.addEventListener("ph-share", reload); return () => window.removeEventListener("ph-share", reload); }, [reload]);
  useEffect(() => { lastUid = uid || lastUid; }, [uid]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);

  const codes = uid ? Object.keys(until).filter((c) => until[c] > now) : [];
  codesRef.current = codes;
  const key = codes.join(",");

  const stop = useCallback((code: string) => {
    try { localStorage.removeItem(PREFIX + code); } catch {}
    if (uid) stopSharing(code, uid);
    reload();
  }, [uid, reload]);
  const start = useCallback((code: string) => {
    try { localStorage.setItem(PREFIX + code, String(Date.now() + SHARE_HOURS * 3600_000)); } catch {}
    setGeoErr(""); reload();
  }, [reload]);

  // Expired switches turn themselves off.
  useEffect(() => { Object.keys(until).forEach((c) => { if (until[c] <= now) stop(c); }); }, [now]); // eslint-disable-line

  // One GPS watch for all groups that are being shared with. Sends are throttled to save battery and data.
  useEffect(() => {
    if (!uid || (!key && !localTrack)) { setMe(null); return; }
    if (!navigator.geolocation) { setGeoErr("This phone can't share location."); return; }
    let lastPt: Point | null = null, lastAt = 0;
    const id = navigator.geolocation.watchPosition((pos) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const h = typeof pos.coords.heading === "number" && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
      setMe((o) => ({ ...pt, heading: h ?? o?.heading ?? null })); setGeoErr("");
      const t0 = Date.now();
      if (t0 - lastAt < 12_000) return;                                      // at most one send per 12 s
      if (lastPt && meters(lastPt, pt) < 25 && t0 - lastAt < 45_000) return; // standing still: heartbeat every 45 s
      lastPt = pt; lastAt = t0;
      codesRef.current.forEach((c) => pushLocation(c, uid, { ...pt, heading: h, acc: pos.coords.accuracy }));
    }, (e) => {
      if (e.code === 1) { setGeoErr("Location is blocked for this site. Allow it in your browser settings, then turn sharing on again."); codesRef.current.forEach(stop); setLocalTrack(false); }
      else setGeoErr("Can't get your location right now. Still trying…");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [key, uid, localTrack]); // eslint-disable-line

  // Optionally keep the screen awake (phones stop sending location when the screen locks).
  const sharingAny = !!key;
  useEffect(() => {
    if (!sharingAny || !keepAwake) return;
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null, dead = false;
    const ask = () => wl.request("screen").then((l) => { if (dead) l.release().catch(() => {}); else lock = l; }).catch(() => {});
    ask();
    const vis = () => { if (document.visibilityState === "visible") ask(); };
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, [sharingAny, keepAwake]);

  return <C.Provider value={{ codes, isOn: (c) => codes.includes(c), start, stop, me, geoErr, keepAwake, setKeepAwake, setLocalTrack }}>{children}</C.Provider>;
}
export const useLiveShare = () => useContext(C);
