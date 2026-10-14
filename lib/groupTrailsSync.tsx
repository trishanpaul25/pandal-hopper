"use client";
import { useEffect } from "react";
import { useAuth } from "./auth";
import { watchGroupTrails } from "./groupTrails";
import { watchMyGroups } from "./groups";
import { readGroupTrails, setGroupTrails, type Trail } from "./trails";

/** Keeps the trails shared with my groups up to date, on every page. Renders nothing.
 *  One listener per group I am in (groups are capped at a few friends, so this is a handful of reads).
 *  The result goes to the phone's cache (see trails.ts), so shared trails also open without signal. */
export function GroupTrailsSync() {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? "";
  useEffect(() => {
    if (loading) return;                                  // don't wipe the cache while sign-in is still being checked
    if (!uid) { if (readGroupTrails().length) setGroupTrails([]); return; }
    const perGroup: Record<string, Trail[]> = {}, subs: Record<string, () => void> = {};
    const cached = readGroupTrails();
    const publish = () => setGroupTrails(Object.values(perGroup).flat());
    const stop = watchMyGroups(uid, (groups) => {
      const codes = new Set(groups.map((g) => g.code));
      Object.keys(subs).forEach((c) => { if (!codes.has(c)) { subs[c](); delete subs[c]; delete perGroup[c]; } });
      groups.forEach((g) => {
        if (subs[g.code]) return;
        perGroup[g.code] = cached.filter((t) => t.group?.code === g.code);   // show the saved copy until the first live update arrives
        subs[g.code] = watchGroupTrails(g, (list) => { perGroup[g.code] = list; publish(); }, () => {});
      });
      publish();
    }, () => {});
    return () => { stop(); Object.values(subs).forEach((u) => u()); };
  }, [uid, loading]);
  return null;
}
