"use client";
import { useStored } from "./useStored";
export const useSeen = () => useStored<string[]>("ph-seen", []);
export const useSaved = () => useStored<string[]>("ph-saved", []);       // pandal ids in my trail
export const useSavedPlaces = () => useStored<string[]>("ph-saved-places", []); // food/sight ids
export const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
