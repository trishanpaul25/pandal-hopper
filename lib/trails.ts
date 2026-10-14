"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushField } from "./sync";

/** Several named trails, saved on this phone and (when signed in) in the user's cloud profile.
 *  "ph-saved" (the old single trail) is read once to build the first trail, so nobody loses their stars. */
export type Trail = { id: string; name: string; ids: string[] };
export type TrailState = { active: string; list: Trail[] };

const KEY = "ph-trails", LEGACY = "ph-saved", EVT = "ph-trails-changed";
export const MAX_TRAILS = 20, MAX_NAME = 40;
export const DEFAULT_ID = "t-main";
const DEFAULT_NAME = "My trail";

const newId = () => "t-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clean = (n: string) => n.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
const uniq = (a: string[]) => Array.from(new Set(a));

function sane(s: unknown): TrailState | null {
  const o = s as TrailState | null;
  if (!o || !Array.isArray(o.list)) return null;
  const list = o.list.filter((t) => t && typeof t.id === "string" && Array.isArray(t.ids))
    .map((t) => ({ id: t.id, name: clean(String(t.name ?? "")) || DEFAULT_NAME, ids: uniq(t.ids.filter((x) => typeof x === "string")) }));
  if (!list.length) return null;
  return { list, active: list.some((t) => t.id === o.active) ? o.active : list[0].id };
}

export function readTrails(): TrailState {
  try {
    const got = sane(JSON.parse(localStorage.getItem(KEY) || "null"));
    if (got) return got;
  } catch {}
  let legacy: string[] = [];
  try { const l = JSON.parse(localStorage.getItem(LEGACY) || "[]"); if (Array.isArray(l)) legacy = l; } catch {}
  return { active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: DEFAULT_NAME, ids: legacy }] };
}

function writeTrails(s: TrailState, push = true) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  if (push) pushField("trails", s.list);
  window.dispatchEvent(new Event(EVT));
}

/** Merge the cloud copy into the phone copy: trails with the same id are unioned, new ones are added. Used at sign-in. */
export function mergeTrails(remote: unknown, legacyRemote: string[]): { state: TrailState; changed: boolean } {
  const local = readTrails();
  const r = sane({ active: "", list: Array.isArray(remote) ? remote : [] });
  const list = local.list.map((t) => ({ ...t }));
  let changed = false;
  (r?.list ?? []).forEach((rt) => {
    const mine = list.find((t) => t.id === rt.id);
    if (!mine) { list.push(rt); changed = true; return; }
    const u = uniq([...rt.ids, ...mine.ids]);
    if (u.length !== rt.ids.length || mine.name !== rt.name) changed = true;
    mine.ids = u;
  });
  if (!r && legacyRemote.length) {                 // an account from before named trails: fold its old list into the first trail
    const main = list[0];
    const u = uniq([...main.ids, ...legacyRemote]);
    if (u.length !== main.ids.length) main.ids = u;
    changed = true;
  }
  if (!r) changed = true;
  return { state: { active: local.active, list: list.slice(0, MAX_TRAILS) }, changed };
}
export const saveMerged = (s: TrailState) => writeTrails(s, false);

export function useTrails() {
  const [state, setState] = useState<TrailState>({ active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: DEFAULT_NAME, ids: [] }] });
  const ref = useRef(state); ref.current = state;
  useEffect(() => {
    const read = () => setState(readTrails());
    read();
    window.addEventListener("ph-sync", read);
    window.addEventListener(EVT, read);
    return () => { window.removeEventListener("ph-sync", read); window.removeEventListener(EVT, read); };
  }, []);

  const commit = useCallback((s: TrailState) => { ref.current = s; setState(s); writeTrails(s); }, []);
  const active = state.list.find((t) => t.id === state.active) ?? state.list[0];

  return {
    trails: state.list, active, activeId: active.id,
    setActive: (id: string) => { if (ref.current.list.some((t) => t.id === id)) commit({ ...ref.current, active: id }); },
    /** Make a new trail (optionally filled) and switch to it. Returns its id, or null if the limit is reached. */
    create: (name: string, ids: string[] = []): string | null => {
      const s = ref.current;
      if (s.list.length >= MAX_TRAILS) return null;
      const id = newId();
      commit({ active: id, list: [...s.list, { id, name: clean(name) || `Trail ${s.list.length + 1}`, ids: uniq(ids) }] });
      return id;
    },
    rename: (id: string, name: string) => { const n = clean(name); if (!n) return; const s = ref.current; commit({ ...s, list: s.list.map((t) => (t.id === id ? { ...t, name: n } : t)) }); },
    remove: (id: string) => {
      const s = ref.current;
      if (s.list.length <= 1) return;
      const list = s.list.filter((t) => t.id !== id);
      commit({ active: s.active === id ? list[0].id : s.active, list });
    },
    /** Add stops to a trail (default: the active one). Returns how many were new. */
    addIds: (ids: string[], trailId?: string): number => {
      const s = ref.current, tid = trailId ?? s.active;
      const t = s.list.find((x) => x.id === tid); if (!t) return 0;
      const fresh = ids.filter((i) => !t.ids.includes(i));
      if (fresh.length) commit({ ...s, list: s.list.map((x) => (x.id === tid ? { ...x, ids: [...x.ids, ...uniq(fresh)] } : x)) });
      return fresh.length;
    },
    setIds: (ids: string[], trailId?: string) => { const s = ref.current, tid = trailId ?? s.active; commit({ ...s, list: s.list.map((x) => (x.id === tid ? { ...x, ids: uniq(ids) } : x)) }); },
    /** Put a trail's stops back as they were (used by Undo). */
    restore: (id: string, ids: string[]) => { const s = ref.current; commit({ ...s, list: s.list.map((x) => (x.id === id ? { ...x, ids } : x)) }); },
  };
}
