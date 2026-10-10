import pandalsData from "@/data/pandals.json";
import placesData from "@/data/places.json";
import routesData from "@/data/routes.json";
import type { Pandal, Place, Route } from "./types";

export const PANDALS = pandalsData as Pandal[];
export const PLACES = placesData as Place[];
export const ROUTES = routesData as Route[];
export const byId = Object.fromEntries(PANDALS.map((p) => [p.id, p]));

export const ZONES: Record<string, { en: string; bn: string; blurb: string }> = {
  north: { en: "North Kolkata", bn: "উত্তর কলকাতা", blurb: "Old clubs, big budgets, narrow lanes." },
  south: { en: "South Kolkata", bn: "দক্ষিণ কলকাতা", blurb: "Theme pandals and late-night crowds." },
  west: { en: "South-west", bn: "দক্ষিণ-পশ্চিম", blurb: "Behala and Naktala. Plan a cab." },
};

// 2026 dates. Sources differ by a day on Shashthi/Saptami because panjikas differ.
export const DAYS = [
  { date: "2026-10-16", d: "16 Oct", wd: "Fri", en: "Maha Shashthi", bn: "মহাষষ্ঠী", what: "Goddess is welcomed at dusk (Bodhon). Pandals begin opening.", tip: "Lighter crowds. A good evening for far-apart routes." },
  { date: "2026-10-17", d: "17 Oct", wd: "Sat", en: "Saptami begins", bn: "সপ্তমী", what: "Saptami tithi starts. Many pandals are already open to visitors.", tip: "Weekend crowds start building after dark." },
  { date: "2026-10-18", d: "18 Oct", wd: "Sun", en: "Maha Saptami", bn: "মহাসপ্তমী", what: "Main Saptami worship and Kolabou puja, according to most panjikas.", tip: "Sunday: expect long queues at famous pandals." },
  { date: "2026-10-19", d: "19 Oct", wd: "Mon", en: "Maha Ashtami", bn: "মহাঅষ্টমী", what: "Anjali, Kumari puja and Sandhi puja at the Ashtami-Navami junction.", tip: "Usually the busiest night. Start early, keep routes short." },
  { date: "2026-10-20", d: "20 Oct", wd: "Tue", en: "Maha Navami", bn: "মহানবমী", what: "Final full day of worship and the Navami homa.", tip: "Still heavy. Late-night hopping is popular." },
  { date: "2026-10-21", d: "21 Oct", wd: "Wed", en: "Bijoya Dashami", bn: "বিজয়া দশমী", what: "Sindoor khela in the morning, immersion processions later.", tip: "Roads near the river close. Go for sindoor khela, not long routes." },
];
export const PUJA_START = "2026-10-16T00:00:00+05:30";
