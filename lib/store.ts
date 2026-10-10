"use client";
import { useStored } from "./useStored";
import { pushField } from "./sync";
// Each list is saved on this phone and, when signed in, copied to the user's cloud profile.
export const useSeen = () => useStored<string[]>("ph-seen", [], (v) => pushField("seen", v));
export const useSaved = () => useStored<string[]>("ph-saved", [], (v) => pushField("saved", v));                // pandal ids in my trail
export const useSavedPlaces = () => useStored<string[]>("ph-saved-places", [], (v) => pushField("savedPlaces", v)); // food/sight ids
export const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
