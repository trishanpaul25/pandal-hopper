"use client";
import { useStored } from "./useStored";
import { useTrails } from "./trails";
import { pushField } from "./sync";
// Each list is saved on this phone and, when signed in, copied to the user's cloud profile.
export const useSeen = () => useStored<string[]>("ph-seen", [], (v) => pushField("seen", v));
/** Pandal ids in the ACTIVE trail. Same shape as before, so every screen keeps working; the trail itself is chosen on /saved. */
export const useSaved = () => { const t = useTrails(); return [t.active.ids, (v: string[]) => t.setIds(v)] as const; };
export const useSavedPlaces = () => useStored<string[]>("ph-saved-places", [], (v) => pushField("savedPlaces", v)); // food/sight ids
export const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
