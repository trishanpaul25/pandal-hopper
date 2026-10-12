"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { meters } from "./geo";
import { saveLastPos, startSharing, stopSharing } from "./groups";
import { openRelay, relayConfigured, sendPos } from "./relay";
import { useStored } from "./useStored";
import type { Point } from "./types";

/** Live location sharing lives here (not in the Groups page) so it keeps running while the person
 *  uses Hop, Pandals or any other page. One GPS watch serves every group that has sharing switched on.
 *  Each group's switch is remembered on this phone as an expiry time, so it turns itself off after SHARE_HOURS. */
export const SHARE_HOURS = 8;
const SEND_MIN_MS = 20_000, SEND_MIN_M = 40, HEARTBEAT_MS = 90_000; // fewer sends = fewer relay messages (positions no longer touch Firestore)
const CHECKPOINT_MS = 5 * 60_000, HIDE_SAVE_MIN_MS = 30_000;          // last-known-position saves to Firestore: rare on purpose
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
  const lastSent = useRef<Me & { acc: number } | null>(null); // my latest position, to answer a friend's "hello" straight away
  const lastSaveAt = useRef(0);

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
    if (!relayConfigured) { setGeoErr("Live location isn't set up yet (missing Supabase keys in .env.local)."); return; }
    const until = Date.now() + SHARE_HOURS * 3600_000;
    try { localStorage.setItem(PREFIX + code, String(until)); } catch {}
    if (uid) startSharing(code, uid, until); // one small write; the positions themselves go through the relay
    setGeoErr(""); reload();
  }, [reload, uid]);

  // Expired switches turn themselves off.
  useEffect(() => { Object.keys(until).forEach((c) => { if (until[c] <= now) stop(c); }); }, [now]); // eslint-disable-line

  // Keep each shared group's relay channel open (to send, and to answer "hello" from a friend who just opened the map).
  useEffect(() => {
    if (!uid || !key) return;
    const rel = key.split(",").map((c) => openRelay(c, uid, { onHello: () => { const p = lastSent.current; if (p) sendPos(c, uid, p); } }));
    return () => rel.forEach((r) => r());
  }, [key, uid]);

  // Save my last known position to Firestore now and then (not live): so late joiners and friends whose phone went to sleep still see "last seen".
  const checkpoint = useCallback((minGap: number) => {
    const p = lastSent.current, t = Date.now();
    if (!uid || !p || !codesRef.current.length || t - lastSaveAt.current < minGap) return;
    lastSaveAt.current = t;
    codesRef.current.forEach((c) => saveLastPos(c, uid, p));
  }, [uid]);
  // One last save when the app goes to the background or closes (best effort: phones don't always allow it).
  useEffect(() => {
    if (!key) return;
    const hide = () => checkpoint(HIDE_SAVE_MIN_MS);
    const vis = () => { if (document.visibilityState === "hidden") hide(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("pagehide", hide);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", hide); };
  }, [key, checkpoint]);

  // One GPS watch for all groups that are being shared with. Sends are throttled to save battery and data.
  useEffect(() => {
    if (!uid || (!key && !localTrack)) { setMe(null); lastSent.current = null; return; }
    lastSaveAt.current = 0; // a newly switched-on group gets its first saved position right away
    if (!navigator.geolocation) { setGeoErr("This phone can't share location."); return; }
    let lastPt: Point | null = null, lastAt = 0;
    const id = navigator.geolocation.watchPosition((pos) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const h = typeof pos.coords.heading === "number" && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
      setMe((o) => ({ ...pt, heading: h ?? o?.heading ?? null })); setGeoErr("");
      const t0 = Date.now();
      if (t0 - lastAt < SEND_MIN_MS) return;                                           // at most one send per 20 s
      if (lastPt && meters(lastPt, pt) < SEND_MIN_M && t0 - lastAt < HEARTBEAT_MS) return; // moved less than 40 m: only a heartbeat every 90 s
      lastPt = pt; lastAt = t0;
      const out = { ...pt, heading: h, acc: pos.coords.accuracy };
      lastSent.current = out;
      codesRef.current.forEach((c) => sendPos(c, uid, out));
      checkpoint(CHECKPOINT_MS);
    }, (e) => {
      if (e.code === 1) { setGeoErr("Location is blocked for this site. Allow it in your browser settings, then turn sharing on again."); codesRef.current.forEach(stop); setLocalTrack(false); }
      else setGeoErr("Can't get your location right now. Still trying…");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [key, uid, localTrack, checkpoint]); // eslint-disable-line

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
