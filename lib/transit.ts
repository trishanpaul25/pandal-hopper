import transitData from "@/data/transit.json";
import { km, route, routeVia, travelMins, type Mode, type StationMark, type Trip, type ViaRoute, type WalkRoute } from "./geo";
import type { Point } from "./types";

/** Stations come from data/transit.json (run `npm run transit` once). lines = which metro line, and the station's position on it. */
export type Station = { id: string; name: string; lat: number; lng: number; lines?: { l: string; i: number }[] };
const T = transitData as { metro?: Station[]; rail?: Station[] };

// Clean-up of known problems in the OpenStreetMap data (ids stay the same each time you re-run `npm run transit`).
// 1. A pedestrian subway near Mahanayak Uttam Kumar is tagged as a station and stole that stop in one direction.
const NOT_A_STATION = new Set(["metro-w359521149"]);
const MAHANAYAK = "metro-n5421536497";
const MAHANAYAK_BACK = { l: "Blue Line (Dakshineshwar → Kavi Subhash)", i: 19 };
const cleaned = (T.metro ?? []).filter((s) => !NOT_A_STATION.has(s.id)).map((s) =>
  s.id === MAHANAYAK && !s.lines?.some((x) => x.l === MAHANAYAK_BACK.l) ? { ...s, lines: [...(s.lines ?? []), MAHANAYAK_BACK] } : s);
// 2. Stations that are on no running line (planned or under-construction extensions) must not be offered as places to board.
//    Only applied when line data exists at all, so a file without line info still works.
const anyLines = cleaned.some((s) => s.lines?.length);
export const METRO: Station[] = anyLines ? cleaned.filter((s) => s.lines?.length) : cleaned;
export const RAIL: Station[] = T.rail ?? [];
/** If the file is empty the Metro option is simply hidden. */
export const HAS_METRO = METRO.length > 0;

// Rough numbers for the ride. Easy to tune.
const STOP_MIN = 2.5;   // minutes per station
const WAIT = 3;         // waiting for the train
const CHANGE = 6;       // changing trains, when the two stations are on different lines
const METRO_KMH = 30;   // used when we don't know the line order

/** The n closest stations. d is km with the same x1.3 road factor used everywhere else. */
export function nearest(p: Point, list: Station[], n = 1): { s: Station; d: number }[] {
  return list.map((s) => ({ s, d: km(p, s) })).sort((a, b) => a.d - b.d).slice(0, n);
}

export type MetroTrip = Trip & { mins: number; useful: boolean; walkOnly: number; s1: Station; s2: Station };

/** Best way to use the metro from a to b: walk to a nearby station, ride, walk on. `useful` is false when plain walking is quicker. */
export function metroTrip(a: Point, b: Point): MetroTrip | null {
  if (!HAS_METRO) return null;
  const A = nearest(a, METRO, 3), B = nearest(b, METRO, 3);
  const walkOnly = travelMins(km(a, b), "walk");
  let best: MetroTrip | null = null;
  for (const x of A) for (const y of B) {
    if (x.s.id === y.s.id) continue;
    const l1 = x.s.lines ?? [], l2 = y.s.lines ?? [];
    const shared = l1.flatMap((p) => l2.filter((q) => q.l === p.l).map((q) => Math.abs(p.i - q.i)));
    let ride: number, stops: number | null = null, change = false;
    const straightKm = km(x.s, y.s) / 1.3;
    if (shared.length) { stops = Math.max(1, Math.min(...shared)); ride = stops * STOP_MIN + WAIT; }
    else if (l1.length && l2.length) { ride = ((straightKm * 1.25) / METRO_KMH) * 60 + WAIT + CHANGE; change = true; }
    else ride = ((straightKm * 1.25) / METRO_KMH) * 60 + WAIT;   // no line data: distance estimate only
    const walk1 = travelMins(x.d, "walk"), walk2 = travelMins(y.d, "walk");
    const mins = Math.round(walk1 + ride + walk2);
    if (!best || mins < best.mins) best = { from: x.s.name, to: y.s.name, stops, change, walk1, ride: Math.round(ride), walk2, mins, useful: false, walkOnly, s1: x.s, s2: y.s };
  }
  if (best) best.useful = best.mins < walkOnly;
  return best;
}

/** Minutes for list rows (no network). For metro it is the faster of "metro trip" and "just walk". */
export function listMins(mode: Mode, d: number, a: Point, b: Point): number {
  if (mode !== "metro") return travelMins(d, mode);
  const t = metroTrip(a, b);
  return t && t.useful ? t.mins : travelMins(d, "walk");
}
/** Total minutes through stops in order. */
export function trailMins(mode: Mode, pts: Point[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += listMins(mode, km(pts[i - 1], pts[i]), pts[i - 1], pts[i]);
  return s;
}

const pt = (s: Point): Point => ({ lat: s.lat, lng: s.lng });
/** The two pins for the map: get in at the first station, get out at the second. */
const marksFor = (t: MetroTrip): StationMark[] => [{ ...pt(t.s1), label: t.from, kind: "enter" }, { ...pt(t.s2), label: t.to, kind: "exit" }];

/** One metro trip with real walking routes at both ends. Falls back to plain walking when that is quicker. */
export async function metroRoute(a: Point, b: Point): Promise<WalkRoute> {
  const t = metroTrip(a, b);
  if (!t || !t.useful) return route("walk", a, b);
  const [w1, w2] = await Promise.all([route("walk", a, t.s1), route("walk", t.s2, b)]);
  const mins = Math.round(w1.mins + t.ride + w2.mins);
  const walk = travelMins(km(a, b), "walk");
  if (mins >= walk) return route("walk", a, b);
  return {
    coords: [...w1.coords, ...w2.coords],            // the straight gap between the two stations is the metro ride
    km: w1.km + (km(t.s1, t.s2) / 1.3) * 1.25 + w2.km, mins, approx: w1.approx || w2.approx,
    trip: { from: t.from, to: t.to, stops: t.stops, change: t.change, walk1: w1.mins, ride: t.ride, walk2: w2.mins },
    marks: marksFor(t), rides: [[pt(t.s1), pt(t.s2)]],
  };
}
/** Same as route() but also understands "metro". */
export const routeFor = (mode: Mode, a: Point, b: Point): Promise<WalkRoute> => (mode === "metro" ? metroRoute(a, b) : route(mode, a, b));

/** A trail through several stops. Metro trails are estimated without network calls (that would be 2 requests per hop). */
export async function metroVia(pts: Point[]): Promise<ViaRoute> {
  const legs: number[] = [], coords: Point[] = pts.length ? [pts[0]] : [];
  const marks: StationMark[] = [], rides: Point[][] = [];
  let mins = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = km(a, b); legs.push(d);
    const t = metroTrip(a, b);
    if (t && t.useful) { coords.push(t.s1, t.s2, b); mins += t.mins; const [inn, out] = marksFor(t), last = marks[marks.length - 1];
      if (!(last && last.kind === "exit" && last.label === inn.label)) marks.push(inn);   // same station again: keep one pin, not two on top of each other
      marks.push(out); rides.push([pt(t.s1), pt(t.s2)]); } else { coords.push(b); mins += travelMins(d, "walk"); }
  }
  return { coords, legs, km: legs.reduce((x, y) => x + y, 0), mins, approx: true, marks, rides };
}
/** Same as routeVia() but also understands "metro". */
export const routeViaFor = (mode: Mode, pts: Point[]): Promise<ViaRoute> => (mode === "metro" ? metroVia(pts) : routeVia(mode, pts));
