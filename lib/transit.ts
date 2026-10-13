import transitData from "@/data/transit.json";
import railLineData from "@/data/rail-lines.json";
import serviceData from "@/data/service.json";
import { km, meters, route, routeVia, travelMins, type Mode, type RideKind, type StationMark, type Trip, type TripLeg, type ViaRoute, type WalkRoute } from "./geo";
import type { Point } from "./types";

/** Stations come from data/transit.json (run `npm run transit` once). lines = which line the station is on, and its position on it. */
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
const anyLines = cleaned.some((s) => s.lines?.length);
export const METRO: Station[] = anyLines ? cleaned.filter((s) => s.lines?.length) : cleaned;
/** Every train station in the data (used for the "nearest station" hints). */
export const RAIL: Station[] = T.rail ?? [];

// Train lines: OpenStreetMap has the stations but not which ones share a line, so data/rail-lines.json lists them in order.
// Only stations that appear in that file can be used for a trip.
const railLines = new Map<string, { l: string; i: number }[]>();
{
  const known = new Set(RAIL.map((s) => s.id));
  for (const line of (railLineData as { lines: { name: string; stations: string[] }[] }).lines) {
    let i = 0;
    for (const id of line.stations) {
      if (!known.has(id)) continue;
      const arr = railLines.get(id) ?? []; arr.push({ l: line.name, i: i++ }); railLines.set(id, arr);
    }
  }
}
/** Train stations that sit on a listed line, i.e. the ones a trip can start, end or change at. */
export const TRAIN: Station[] = RAIL.filter((s) => railLines.has(s.id)).map((s) => ({ ...s, lines: railLines.get(s.id) }));

type Node = Station & { kind: RideKind };
const NODES: Node[] = [
  ...METRO.filter((s) => s.lines?.length).map((s): Node => ({ ...s, kind: "metro" })),
  ...TRAIN.map((s): Node => ({ ...s, kind: "train" })),
];
/** Metro and train are one option on the site ("Metro / Train"). If there is no usable station data it is simply hidden. */
export const HAS_TRANSIT = NODES.length > 0;
export const HAS_METRO = HAS_TRANSIT;   // old name, kept so nothing else breaks

// Rough numbers for the ride. Easy to tune.
const METRO_STOP = 2;      // minutes per metro station (Dum Dum to Kavi Subhash is about 1 hour for ~30 stops)
const TRAIN_KMH = 30;      // suburban local, average including stops. Ride time is worked out from distance because the line files skip some small stations
const PLATFORM = 3;        // changing to another line at the same station
const EXIT = 1;            // getting off and out of the platform
const XFER_M = 500;        // stations closer than this (straight line) can be walked between to change, e.g. Dum Dum Junction <-> Dum Dum metro
const XFER_MIXED = 5;      // extra minutes to change between train and metro: leave the station, ticket, security, find the entrance
const XFER_SAME = 4;       // extra minutes to change between two stations of the same kind (e.g. Esplanade Line 1 <-> Line 2)
const OPEN_WAIT = 30;      // if a line opens within this many minutes we will wait for the first train; longer than that it counts as closed
const ROAD = 1.3;          // same straight-line to road factor used by km()
const TRACK = 1.15;        // track is a bit longer than the straight line between stations

// ---------------------------------------------------------------------------------------------
// Service hours (data/service.json): when each line runs and how often. Times are Kolkata time.
// ---------------------------------------------------------------------------------------------
type Win = { from: number; to: number; headway: number };
type RawWins = { from: string; to: string; headway: number }[];
type RawDay = Record<string, RawWins>;
const SVC = serviceData as unknown as { defaults: RawDay; lines: RawDay; weekly?: Record<string, RawDay>; days?: Record<string, RawDay> };
const IST = 330 * 60000;                                   // UTC+5:30 in ms
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const winCache = new Map<string, Win[]>();
/** The windows a line runs in on a day (day = days since 1970-01-01, Kolkata date). */
function windowsFor(line: string, day: number): Win[] {
  const key = `${line}|${day}`, hit = winCache.get(key); if (hit) return hit;
  const kind = lineKind.get(line) ?? "metro";
  const base = kind === "metro" ? line.replace(/\s*\(.*\)\s*$/, "") : line;   // "Blue Line (A → B)" -> "Blue Line"
  const dk = new Date(day * 86400000).toISOString().slice(0, 10);
  const raw = SVC.days?.[dk]?.[base] ?? SVC.weekly?.[DOW[(day + 4) % 7]]?.[base] ?? SVC.lines[base] ?? SVC.defaults[kind];   // 1970-01-01 was a Thursday
  const out = (raw ?? []).map((w) => ({ from: hm(w.from), to: hm(w.to), headway: w.headway }));
  winCache.set(key, out); return out;
}
/** Minutes since 1970-01-01 in Kolkata time. `at` is a normal timestamp (ms); undefined means now. */
const istMin = (at?: number) => Math.floor(((at ?? Date.now()) + IST) / 60000);
/** Can you board this line at t (Kolkata minutes)? Gives the average wait (half the gap between trains, or the time until the first train). */
function service(line: string, t: number): { wait: number; headway: number; open: boolean } | null {
  const day = Math.floor(t / 1440);
  let soon: { wait: number; headway: number; open: boolean } | null = null;
  for (const d of [day, day - 1]) {                       // yesterday's schedule can run past midnight
    const m = t - d * 1440;
    for (const w of windowsFor(line, d)) {
      if (m >= w.from && m <= w.to) return { wait: w.headway / 2, headway: w.headway, open: true };
      if (m < w.from && w.from - m <= OPEN_WAIT && (!soon || w.from - m < soon.wait)) soon = { wait: w.from - m, headway: w.headway, open: false };
    }
  }
  return soon;
}
/** Is any metro or train running at this time? (false = e.g. 3 am on a normal night) */
export function serviceOpen(at?: number): boolean {
  const t = istMin(at);
  for (const l of lineKind.keys()) if (service(l, t)?.open) return true;
  return !lineKind.size;
}

/** The n closest stations. d is km with the same x1.3 road factor used everywhere else. */
export function nearest(p: Point, list: Station[], n = 1): { s: Station; d: number }[] {
  return list.map((s) => ({ s, d: km(p, s) })).sort((a, b) => a.d - b.d).slice(0, n);
}

// ---------------------------------------------------------------------------------------------
// The network as a graph. A "state" is "standing at station X" or "sitting on line L at station X".
// Standing comes in two kinds: fresh (just walked in from the street) and arrived (just got off a vehicle or walked from another station).
//   board  : standing -> on a line        (cost = wait for the vehicle, from service hours; + PLATFORM if you just arrived by another one)
//   ride   : on line L -> next/prev stop  (metro: fixed minutes per stop. train: from the distance)
//   alight : on a line -> arrived         (cost = EXIT)
//   walk   : standing -> arrived at a station within XFER_M (walking time + XFER_MIXED / XFER_SAME). This is the metro <-> train change.
// Staying on the same line costs nothing extra, changing line pays the wait again.
// ---------------------------------------------------------------------------------------------
type St = { n: number; line: string | null; arrived: boolean };
const states: St[] = [];
const stKey = new Map<string, number>();
const addState = (n: number, line: string | null, arrived = false) => { const k = `${n}|${line ?? ""}|${arrived ? 1 : 0}`; let id = stKey.get(k); if (id === undefined) { id = states.length; states.push({ n, line, arrived }); stKey.set(k, id); } return id; };
const fresh: number[] = NODES.map((_, n) => addState(n, null, false));
const arrived: number[] = NODES.map((_, n) => addState(n, null, true));
type Edge = { to: number; w: number; board?: string };   // board = the line, so the wait can be worked out from the clock when the edge is used
const adj: Edge[][] = [];
const lineKind = new Map<string, RideKind>();
{
  const byLine = new Map<string, { n: number; i: number }[]>();
  NODES.forEach((s, n) => s.lines?.forEach(({ l, i }) => { lineKind.set(l, s.kind); (byLine.get(l) ?? byLine.set(l, []).get(l)!).push({ n, i }); }));
  const edgesOf = (id: number) => (adj[id] ??= []);
  NODES.forEach((_, n) => { edgesOf(fresh[n]); edgesOf(arrived[n]); });
  for (const [l, arr] of byLine) {
    const kind = lineKind.get(l)!;
    arr.sort((a, b) => a.i - b.i);
    const ids = arr.map(({ n }) => addState(n, l));
    arr.forEach(({ n }, k) => {
      edgesOf(fresh[n]).push({ to: ids[k], w: 0, board: l });
      edgesOf(arrived[n]).push({ to: ids[k], w: PLATFORM, board: l });
      edgesOf(ids[k]).push({ to: arrived[n], w: EXIT });
      if (k > 0) {
        const a = NODES[arr[k - 1].n], b = NODES[n];
        const w = kind === "metro" ? METRO_STOP : Math.max(2, ((km(a, b) / ROAD) * TRACK / TRAIN_KMH) * 60);
        edgesOf(ids[k]).push({ to: ids[k - 1], w }); edgesOf(ids[k - 1]).push({ to: ids[k], w });
      }
    });
  }
  NODES.forEach((a, i) => NODES.forEach((b, j) => {
    if (i === j) return;
    const m = meters(a, b);
    if (m > XFER_M) return;
    const w = Math.max(2, Math.round((m * ROAD) / 83)) + (a.kind !== b.kind ? XFER_MIXED : XFER_SAME);   // walk (83 m per min) plus the hassle of changing
    edgesOf(fresh[i]).push({ to: arrived[j], w }); edgesOf(arrived[i]).push({ to: arrived[j], w });
  }));
}

type Tree = { dist: Float64Array; prev: Int32Array; rode: Uint8Array };
const trees = new Map<string, Tree>();
/** Cheapest way from "standing at station s at clock time `start`" (Kolkata minutes) to every other state. Cached per station and 5-minute slot. */
function treeFrom(s: number, start: number): Tree {
  const key = `${s}|${start}`, hit = trees.get(key); if (hit) return hit;
  if (trees.size > 4000) trees.clear();
  const S = states.length, dist = new Float64Array(S).fill(Infinity), prev = new Int32Array(S).fill(-1), rode = new Uint8Array(S), done = new Uint8Array(S);
  dist[fresh[s]] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < S; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const e of adj[u] ?? []) {
      let w = e.w;
      if (e.board) { const sv = service(e.board, start + dist[u]); if (!sv) continue; w += sv.wait; }   // line not running at that time: no way on
      const v = dist[u] + w;
      if (v < dist[e.to]) { dist[e.to] = v; prev[e.to] = u; rode[e.to] = rode[u] || (e.board ? 1 : 0); }
    }
  }
  const t = { dist, prev, rode }; trees.set(key, t); return t;
}

type Seg = { type: "ride"; mode: RideKind; pts: Node[] } | { type: "walk"; pts: Node[] };
/** A whole public transport trip from a to b. `useful` is false when plain walking is quicker. */
export type TransitTrip = Trip & { mins: number; useful: boolean; walkOnly: number; first: Node; last: Node; legs: TripLeg[]; segs: Seg[]; rideKm: number };

/** Up to 3 nearest metro and 3 nearest train stations: the places worth walking to. */
function around(p: Point): { n: number; d: number }[] {
  const pick = (kind: RideKind) => NODES.map((s, n) => ({ n, d: km(p, s), kind: s.kind })).filter((x) => x.kind === kind).sort((a, b) => a.d - b.d).slice(0, 3);
  return [...pick("metro"), ...pick("train")];
}

const cache = new Map<string, TransitTrip | null>();
const keyOf = (a: Point, b: Point, slot: number) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}@${slot}`;

/** Best way to use metro and trains from a to b if you leave at `at` (ms timestamp, default now): walk to a station, ride (changing between trains and metro if needed), walk on.
 *  Lines that are not running at that time are not used. Null when there is no way at all. */
export function transitTrip(a: Point, b: Point, at?: number): TransitTrip | null {
  if (!HAS_TRANSIT) return null;
  const now = istMin(at), slot = Math.floor(now / 5);
  const ck = keyOf(a, b, slot); if (cache.has(ck)) return cache.get(ck)!;
  const walkOnly = travelMins(km(a, b), "walk");
  let best: { s: number; t: number; mins: number; w1: number; w2: number; start: number } | null = null;
  const A = around(a), B = around(b);
  for (const x of A) {
    const w1 = travelMins(x.d, "walk");
    const start = Math.floor((now + w1) / 5) * 5;           // clock time when you reach the station
    const tree = treeFrom(x.n, start);
    for (const y of B) {
      if (x.n === y.n) continue;
      const t = arrived[y.n];
      if (!isFinite(tree.dist[t]) || !tree.rode[t]) continue;
      const w2 = travelMins(y.d, "walk");
      const mins = Math.round(w1 + tree.dist[t] + w2);
      if (!best || mins < best.mins) best = { s: x.n, t: y.n, mins, w1, w2, start };
    }
  }
  let out: TransitTrip | null = null;
  if (best) {
    const tree = treeFrom(best.s, best.start);
    // Walk back through the cheapest path and cut it into rides and changes.
    const path: number[] = []; for (let c = arrived[best.t]; c !== -1; c = tree.prev[c]) path.push(c); path.reverse();
    const legs: TripLeg[] = [], segs: Seg[] = [];
    let cur: { line: string; mode: RideKind; pts: Node[]; mins: number; every: number } | null = null;
    let rideKm = 0;
    for (let i = 1; i < path.length; i++) {
      const u = states[path[i - 1]], v = states[path[i]], w = tree.dist[path[i]] - tree.dist[path[i - 1]];
      if (u.line === null && v.line !== null) {                                                                              // board
        cur = { line: v.line, mode: lineKind.get(v.line)!, pts: [NODES[v.n]], mins: w, every: service(v.line, best.start + tree.dist[path[i - 1]])?.headway ?? 0 };
      } else if (u.line !== null && v.line !== null) { cur!.pts.push(NODES[v.n]); cur!.mins += w; }                          // ride one stop
      else if (u.line !== null && v.line === null) {                                                                         // get off
        cur!.mins += w;
        const pts = cur!.pts;
        legs.push({ kind: "ride", mode: cur!.mode, from: pts[0].name, to: pts[pts.length - 1].name, stops: pts.length - 1, mins: Math.round(cur!.mins), every: cur!.every });
        segs.push({ type: "ride", mode: cur!.mode, pts });
        for (let k = 1; k < pts.length; k++) rideKm += (km(pts[k - 1], pts[k]) / ROAD) * TRACK;
        cur = null;
      } else if (u.n !== v.n) {                                                                                              // walk to change station
        legs.push({ kind: "walk", from: NODES[u.n].name, to: NODES[v.n].name, mins: Math.round(w) });
        segs.push({ type: "walk", pts: [NODES[u.n], NODES[v.n]] });
        rideKm += km(NODES[u.n], NODES[v.n]);
      }
    }
    const rides = legs.filter((l): l is Extract<TripLeg, { kind: "ride" }> => l.kind === "ride");
    if (rides.length) {
      const rideMins = Math.round(tree.dist[arrived[best.t]]);
      out = {
        from: rides[0].from, to: rides[rides.length - 1].to, stops: rides.reduce((s, l) => s + l.stops, 0), change: rides.length > 1,
        walk1: best.w1, ride: rideMins, walk2: best.w2, legs, mins: best.mins, useful: best.mins < walkOnly, walkOnly,
        first: NODES[best.s], last: NODES[best.t], segs, rideKm,
      };
    }
  }
  if (cache.size > 6000) cache.clear();
  cache.set(ck, out);
  return out;
}

/** Minutes for list rows (no network). For "Metro / Train" it is the faster of "public transport" and "just walk". `at` = when you leave (default now). */
export function listMins(mode: Mode, d: number, a: Point, b: Point, at?: number): number {
  if (mode !== "metro") return travelMins(d, mode);
  const t = transitTrip(a, b, at);
  return t && t.useful ? t.mins : travelMins(d, "walk");
}
/** Total minutes through stops in order. For Metro / Train the clock moves on after each hop, so a late hop sees late-night service. */
export function trailMins(mode: Mode, pts: Point[], at?: number): number {
  let s = 0, clock = at ?? Date.now();
  for (let i = 1; i < pts.length; i++) {
    const m = listMins(mode, km(pts[i - 1], pts[i]), pts[i - 1], pts[i], clock);
    s += m; clock += m * 60000;
  }
  return s;
}

const pt = (s: Point): Point => ({ lat: s.lat, lng: s.lng });
/** Everything the map needs for the middle part of a trip: the line through the stations, pins, and the rides (dashed, coloured by metro or train). */
function geometry(t: TransitTrip) {
  const mid: Point[] = [], marks: StationMark[] = [], rides: Point[][] = [], rideKinds: RideKind[] = [];
  t.segs.forEach((sg, i) => {
    sg.pts.forEach((p) => { const last = mid[mid.length - 1]; if (!last || last.lat !== p.lat || last.lng !== p.lng) mid.push(pt(p)); });
    if (sg.type !== "ride") return;
    rides.push(sg.pts.map(pt)); rideKinds.push(sg.mode);
    const first = sg.pts[0], end = sg.pts[sg.pts.length - 1];
    if (!marks.length) marks.push({ ...pt(first), label: first.name, kind: "enter", mode: sg.mode });
    const next = t.segs.slice(i + 1).find((x) => x.type === "ride");
    if (!next) { marks.push({ ...pt(end), label: end.name, kind: "exit", mode: sg.mode }); return; }
    const to = next.pts[0];   // where the next ride starts (the same station, or the one a short walk away)
    marks.push({ ...pt(end), label: end.name === to.name ? end.name : `${end.name} → ${to.name}`, kind: "change", mode: next.type === "ride" ? next.mode : sg.mode });
  });
  return { mid, marks, rides, rideKinds };
}

/** One trip with real walking routes at both ends. Falls back to plain walking when that is quicker. */
export async function transitRoute(a: Point, b: Point, at?: number): Promise<WalkRoute> {
  const t = transitTrip(a, b, at);
  if (!t || !t.useful) return route("walk", a, b);
  const [w1, w2] = await Promise.all([route("walk", a, t.first), route("walk", t.last, b)]);
  const mins = Math.round(w1.mins + t.ride + w2.mins);
  if (mins >= travelMins(km(a, b), "walk")) return route("walk", a, b);
  const g = geometry(t);
  return {
    coords: [...w1.coords, ...g.mid, ...w2.coords],   // walk, then through each station on the way, then walk
    km: w1.km + t.rideKm + w2.km, mins, approx: w1.approx || w2.approx,
    trip: { from: t.from, to: t.to, stops: t.stops, change: t.change, walk1: w1.mins, ride: t.ride, walk2: w2.mins, legs: t.legs },
    marks: g.marks, rides: g.rides, rideKinds: g.rideKinds,
  };
}
/** Same as route() but also understands "metro" (shown on the site as Metro / Train). */
export const routeFor = (mode: Mode, a: Point, b: Point, at?: number): Promise<WalkRoute> => (mode === "metro" ? transitRoute(a, b, at) : route(mode, a, b));

/** A trail through several stops. Public transport trails are estimated without network calls (that would be 2 requests per hop). */
export async function transitVia(pts: Point[], at?: number): Promise<ViaRoute> {
  const legs: number[] = [], coords: Point[] = pts.length ? [pts[0]] : [];
  const marks: StationMark[] = [], rides: Point[][] = [], rideKinds: RideKind[] = [];
  let mins = 0, clock = at ?? Date.now();   // the clock moves on after each hop
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = km(a, b); legs.push(d);
    const t = transitTrip(a, b, clock);
    if (t && t.useful) {
      const g = geometry(t);
      coords.push(...g.mid, b); mins += t.mins; clock += t.mins * 60000;
      const [inn, ...rest] = g.marks, last = marks[marks.length - 1];
      if (!(last && last.kind === "exit" && last.label === inn.label)) marks.push(inn);   // same station again: keep one pin, not two on top of each other
      marks.push(...rest); rides.push(...g.rides); rideKinds.push(...g.rideKinds);
    } else { coords.push(b); const m = travelMins(d, "walk"); mins += m; clock += m * 60000; }
  }
  return { coords, legs, km: legs.reduce((x, y) => x + y, 0), mins, approx: true, marks, rides, rideKinds };
}
/** Same as routeVia() but also understands "metro" (shown on the site as Metro / Train). */
export const routeViaFor = (mode: Mode, pts: Point[], at?: number): Promise<ViaRoute> => (mode === "metro" ? transitVia(pts, at) : routeVia(mode, pts));

/** The trip as plain steps for the "Heading to" card, e.g.
 *  Walk 5 min to Birati (train) / Train: Birati → Dum Dum Junction / Change to Dum Dum (metro) / Metro: Dum Dum → Shyambazar / Walk 12 min from Shyambazar to the pandal. */
export function tripSteps(trip: Trip, lang: "en" | "bn", dest = ""): { icon: string; text: string }[] {
  const bn = lang === "bn", legs = trip.legs ?? [];
  const rides = legs.filter((l): l is Extract<TripLeg, { kind: "ride" }> => l.kind === "ride");
  if (!rides.length) return [];
  const kindWord = (m: RideKind) => (bn ? (m === "train" ? "ট্রেন" : "মেট্রো") : (m === "train" ? "train" : "metro"));
  const icon = (m: RideKind) => (m === "train" ? "🚆" : "🚇");
  const mins = (n: number) => (bn ? `${n} মিনিট` : `${n} min`);
  const stopsText = (n: number) => (bn ? `${n}টি স্টেশন` : `${n} ${n === 1 ? "stop" : "stops"}`);
  const everyText = (n?: number) => (n ? (bn ? ` · প্রতি ~${n} মিনিটে` : ` · every ~${n} min`) : "");
  const out: { icon: string; text: string }[] = [];
  out.push({ icon: "🚶", text: bn ? `${mins(trip.walk1)} হেঁটে ${rides[0].from} (${kindWord(rides[0].mode)}) স্টেশনে যান` : `Walk ${mins(trip.walk1)} to ${rides[0].from} (${kindWord(rides[0].mode)})` });
  legs.forEach((l, i) => {
    if (l.kind === "ride") {
      out.push({ icon: icon(l.mode), text: bn
        ? `${l.mode === "train" ? "ট্রেন" : "মেট্রো"}: ${l.from} থেকে ${l.to} · ${stopsText(l.stops)} · ~${mins(l.mins)}${everyText(l.every)}`
        : `${l.mode === "train" ? "Train" : "Metro"}: ${l.from} → ${l.to} · ${stopsText(l.stops)} · ~${mins(l.mins)}${everyText(l.every)}` });
    } else {
      const next = legs.slice(i + 1).find((x): x is Extract<TripLeg, { kind: "ride" }> => x.kind === "ride");
      out.push({ icon: "🔁", text: bn
        ? `বদলান: ${l.to}${next ? ` (${kindWord(next.mode)})` : ""} স্টেশনে যান · ~${mins(l.mins)}`
        : `Change to ${l.to}${next ? ` (${kindWord(next.mode)})` : ""} · ~${mins(l.mins)}` });
    }
  });
  const lastRide = rides[rides.length - 1];
  out.push({ icon: "🚶", text: bn ? `${lastRide.to} থেকে ${mins(trip.walk2)} হেঁটে ${dest || "গন্তব্যে"} পৌঁছান` : `Walk ${mins(trip.walk2)} from ${lastRide.to}${dest ? ` to ${dest}` : ""}` });
  return out;
}
