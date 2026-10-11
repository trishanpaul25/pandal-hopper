import pandalsData from "@/data/pandals.json";
import placesData from "@/data/places.json";
import routesData from "@/data/routes.json";
import type { Pandal, Place, Route } from "./types";

export const PANDALS = pandalsData as Pandal[];
export const PLACES = placesData as Place[];
export const ROUTES = routesData as Route[];
export const byId = Object.fromEntries(PANDALS.map((p) => [p.id, p]));

/** Pandals with a real pin. Anything with a placeholder location is kept out of routing, nearest and trails. */
export const NAVIGABLE = PANDALS.filter((p) => p.precision !== "approx");

const KNOWN: Record<string, { en: string; bn: string; blurb: string }> = {
  north: { en: "North Kolkata", bn: "উত্তর কলকাতা", blurb: "Old clubs, big budgets, narrow lanes." },
  south: { en: "South Kolkata", bn: "দক্ষিণ কলকাতা", blurb: "Theme pandals and late-night crowds." },
  central: { en: "Central Kolkata", bn: "মধ্য কলকাতা", blurb: "College Street, Park Street and the city centre." },
  east: { en: "East Kolkata", bn: "পূর্ব কলকাতা", blurb: "Sealdah side, Salt Lake and the east." },
  west: { en: "South-west", bn: "দক্ষিণ-পশ্চিম", blurb: "Behala and Naktala. Plan a cab." },
  howrah: { en: "Howrah", bn: "হাওড়া", blurb: "Across the Hooghly." },
  bonedi: { en: "Bonedi Bari", bn: "বনেদি বাড়ি", blurb: "Old family pujas in heritage homes." },
  others: { en: "Other areas", bn: "অন্যান্য এলাকা", blurb: "Suburbs and nearby towns." },
  other: { en: "Other areas", bn: "অন্যান্য এলাকা", blurb: "Suburbs and nearby towns." },
};
const title = (z: string) => z.charAt(0).toUpperCase() + z.slice(1);
/** Only the areas that appear in pandals.json, so every zone in your data gets its own filter chip. */
export const ZONES: Record<string, { en: string; bn: string; blurb: string }> = Object.fromEntries(
  [...new Set(PANDALS.map((p) => p.zone))].sort().map((z) => [z, KNOWN[z] ?? { en: title(z), bn: title(z), blurb: "" }]));

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
