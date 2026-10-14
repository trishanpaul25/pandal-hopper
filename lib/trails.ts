"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushField } from "./sync";
import { GPREFIX, canManageTrail, deleteGroupTrail, editGroupStops, renameGroupTrail } from "./groupTrails";

/** Several named trails, saved on this phone and (when signed in) in the user's cloud profile.
 *  "ph-saved" (the old single trail) is read once to build the first trail, so nobody loses their stars. */
export type Trail = {
  id: string; name: string; ids: string[];
  /** Set only on a trail that is shared with a group. Its stops live in Firestore (see lib/groupTrails.ts), not in this phone's trail list. */
  group?: { code: string; tid: string; groupName: string; sharedBy: string; owner: string; editedBy?: string };
};
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
  const shared = typeof o.active === "string" && o.active.startsWith(GPREFIX); // a shared trail is not in this list, it is looked up later
  return { list, active: list.some((t) => t.id === o.active) || shared ? o.active : list[0].id };
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

// ---- Trails shared with a group. They are kept apart from the phone's own trails and are NOT copied to the user's cloud profile:
// the group's copy in Firestore is the real one. The phone keeps a cache so they still open without signal.
const GKEY = "ph-gtrails", GEVT = "ph-gtrails-changed";
let groupMem: Trail[] | null = null;
export function readGroupTrails(): Trail[] {
  if (groupMem) return groupMem;
  let out: Trail[] = [];
  try {
    const l = JSON.parse(localStorage.getItem(GKEY) || "[]");
    if (Array.isArray(l)) out = l.filter((t) => t && typeof t.id === "string" && Array.isArray(t.ids) && t.group && typeof t.group.code === "string");
  } catch {}
  return (groupMem = out);
}
export function setGroupTrails(list: Trail[]) {
  groupMem = list;
  try { localStorage.setItem(GKEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new Event(GEVT));
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
  const [group, setGroup] = useState<Trail[]>([]);
  const ref = useRef(state); ref.current = state;
  const gref = useRef(group); gref.current = group;
  useEffect(() => {
    const read = () => setState(readTrails());
    const readG = () => setGroup(readGroupTrails());
    read(); readG();
    window.addEventListener("ph-sync", read);
    window.addEventListener(EVT, read);
    window.addEventListener(GEVT, readG);
    return () => { window.removeEventListener("ph-sync", read); window.removeEventListener(EVT, read); window.removeEventListener(GEVT, readG); };
  }, []);

  const commit = useCallback((s: TrailState) => { ref.current = s; setState(s); writeTrails(s); }, []);
  const all = [...state.list, ...group];
  const active = all.find((t) => t.id === state.active) ?? state.list[0]; // falls back to the first own trail if a shared one was removed
  const shared = (id?: string) => gref.current.find((t) => t.id === id);
  /** Make a shared trail's stops match `ids` (adds the new ones, removes the missing ones). */
  const syncShared = (g: Trail, ids: string[]) => { const next = uniq(ids); editGroupStops(g, next.filter((i) => !g.ids.includes(i)), g.ids.filter((i) => !next.includes(i))); };

  return {
    /** Own trails first, then the ones shared with my groups (those have `.group` set). */
    trails: all, localTrails: state.list, active, activeId: active.id,
    canManage: (t: Trail) => canManageTrail(t),
    setActive: (id: string) => { if (ref.current.list.some((t) => t.id === id) || id.startsWith(GPREFIX)) commit({ ...ref.current, active: id }); },
    /** Make a new trail (optionally filled) and switch to it. Returns its id, or null if the limit is reached. */
    create: (name: string, ids: string[] = []): string | null => {
      const s = ref.current;
      if (s.list.length >= MAX_TRAILS) return null;
      const id = newId();
      commit({ active: id, list: [...s.list, { id, name: clean(name) || `Trail ${s.list.length + 1}`, ids: uniq(ids) }] });
      return id;
    },
    rename: (id: string, name: string) => {
      const n = clean(name); if (!n) return;
      const g = shared(id); if (g) { renameGroupTrail(g, n); return; }
      const s = ref.current; commit({ ...s, list: s.list.map((t) => (t.id === id ? { ...t, name: n } : t)) });
    },
    /** Delete a trail of mine, or stop sharing a shared one (only the person who shared it or the group owner can). */
    remove: (id: string) => {
      const g = shared(id); if (g) { if (canManageTrail(g)) deleteGroupTrail(g); return; }
      const s = ref.current;
      if (s.list.length <= 1) return;
      const list = s.list.filter((t) => t.id !== id);
      commit({ active: s.active === id ? list[0].id : s.active, list });
    },
    /** Add stops to a trail (default: the active one). Returns how many were new. */
    addIds: (ids: string[], trailId?: string): number => {
      const s = ref.current, tid = trailId ?? active.id;
      const g = shared(tid);
      if (g) { const fresh = uniq(ids.filter((i) => !g.ids.includes(i))); if (fresh.length) editGroupStops(g, fresh, []); return fresh.length; }
      const t = s.list.find((x) => x.id === tid); if (!t) return 0;
      const fresh = ids.filter((i) => !t.ids.includes(i));
      if (fresh.length) commit({ ...s, list: s.list.map((x) => (x.id === tid ? { ...x, ids: [...x.ids, ...uniq(fresh)] } : x)) });
      return fresh.length;
    },
    setIds: (ids: string[], trailId?: string) => {
      const s = ref.current, tid = trailId ?? active.id;
      const g = shared(tid); if (g) { syncShared(g, ids); return; }
      commit({ ...s, list: s.list.map((x) => (x.id === tid ? { ...x, ids: uniq(ids) } : x)) });
    },
    /** Put a trail's stops back as they were (used by Undo). */
    restore: (id: string, ids: string[]) => {
      const g = shared(id); if (g) { syncShared(g, ids); return; }
      const s = ref.current; commit({ ...s, list: s.list.map((x) => (x.id === id ? { ...x, ids } : x)) });
    },
  };
}
