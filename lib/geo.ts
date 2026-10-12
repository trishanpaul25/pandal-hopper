import type { Point } from "./types";
const R = Math.PI / 180;

/** Straight-line distance x1.3 as a rough road-distance estimate. */
export function km(a: Point, b: Point): number {
  const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
}
/** Straight-line metres (no road factor). Used for "have I arrived?" checks. */
export function meters(a: Point, b: Point): number {
  const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export type RoadMode = "walk" | "bike" | "car";
export type Mode = RoadMode | "metro";
/** speed = km/h used when the router is offline (straight line x1.3 already added).
 *  crowd = how much slower than free-flow a puja night is (the router knows nothing about traffic). Easy to tune. */
export const MODE_META: Record<Mode, { speed: number; crowd: number }> = {
  walk: { speed: 5, crowd: 1 },
  bike: { speed: 20, crowd: 1.3 },   // two-wheeler: uses the road network, slips through traffic
  car: { speed: 15, crowd: 1.8 },
  metro: { speed: 20, crowd: 1 },    // only a fallback; real metro times come from lib/transit.ts
};
/** Minutes for a distance in km, using the offline speed for the mode. */
export const travelMins = (d: number, mode: Mode = "walk") => Math.max(1, Math.round((d / MODE_META[mode].speed) * 60));
const routeUrl = (mode: RoadMode, pts: Point[]) =>
  `https://routing.openstreetmap.de/${mode === "walk" ? "routed-foot/route/v1/foot" : "routed-car/route/v1/driving"}/${pts.map((q) => `${q.lng},${q.lat}`).join(";")}?overview=full&geometries=geojson`;
/** Walking uses distance / 83 m per min (as before). Bike and car use the router's drive time x the puja-night crowd factor. */
const routeMins = (mode: RoadMode, distM: number, durS: number) =>
  mode === "walk" ? Math.max(1, Math.round(distM / 83)) : Math.max(1, Math.round((durS / 60) * MODE_META[mode].crowd));

/** A metro trip split into parts (minutes): walk to the station, ride, walk from the station. */
export type Trip = { from: string; to: string; stops: number | null; change: boolean; walk1: number; ride: number; walk2: number };
export type WalkRoute = { coords: Point[]; km: number; mins: number; approx: boolean; trip?: Trip };
/** Real route from OSM's public router (foot for walking, road network for bike/car). Falls back to a straight line if offline or blocked. */
export async function route(mode: RoadMode, a: Point, b: Point): Promise<WalkRoute> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const j = await (await fetch(routeUrl(mode, [a, b]), { signal: ctrl.signal })).json();
    const r = j.routes?.[0]; if (!r) throw new Error("no route");
    return { coords: r.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })), km: r.distance / 1000, mins: routeMins(mode, r.distance, r.duration), approx: false };
  } catch {
    const d = km(a, b); return { coords: [a, b], km: d, mins: travelMins(d, mode), approx: true };
  } finally { clearTimeout(t); }
}
export const walkRoute = (a: Point, b: Point) => route("walk", a, b);
/** Compass bearing in degrees (0 = north) from a to b. */
export function bearing(a: Point, b: Point): number {
  const y = Math.sin((b.lng - a.lng) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lng - a.lng) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}
export type ViaRoute = { coords: Point[]; legs: number[]; km: number; mins: number; approx: boolean };
/** One route through several points in order. legs[i] is the km from point i to point i+1. Falls back to straight lines. */
export async function routeVia(mode: RoadMode, pts: Point[]): Promise<ViaRoute> {
  const straight = (): ViaRoute => {
    const legs = pts.slice(1).map((q, i) => km(pts[i], q)); const total = legs.reduce((a, b) => a + b, 0);
    return { coords: pts, legs, km: total, mins: travelMins(total, mode), approx: true };
  };
  if (pts.length < 2) return { coords: pts, legs: [], km: 0, mins: 0, approx: false };
  try {
    const coords: Point[] = []; const legs: number[] = []; let dur = 0;
    for (let i = 0; i < pts.length - 1; i += 24) {           // the public router takes ~25 points per request
      const chunk = pts.slice(i, i + 25); if (chunk.length < 2) break;
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const j = await (await fetch(routeUrl(mode, chunk), { signal: ctrl.signal })).json();
        const r = j.routes?.[0]; if (!r) throw new Error("no route");
        const c: Point[] = r.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng }));
        coords.push(...(coords.length ? c.slice(1) : c));
        r.legs.forEach((l: { distance: number }) => legs.push(l.distance / 1000));
        dur += r.duration;
      } finally { clearTimeout(t); }
    }
    const total = legs.reduce((a, b) => a + b, 0);
    return { coords, legs, km: total, mins: routeMins(mode, total * 1000, dur), approx: false };
  } catch { return straight(); }
}
export const walkRouteVia = (pts: Point[]) => routeVia("walk", pts);
export const walkMins = (d: number) => Math.max(1, Math.round(d * 12)); // ~5 km/h
export const fmtDist = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

export function pathLen<T extends Point>(start: Point, arr: T[]): number {
  let s = 0, p: Point = start;
  for (const q of arr) { s += km(p, q); p = q; }
  return s;
}

/** Nearest neighbour first, then 2-opt to remove crossings. Start point is fixed. */
export function plan<T extends Point>(start: Point, pts: T[]): T[] {
  const n = pts.length; if (n <= 1) return [...pts];
  // Distance table: node 0 is the start, nodes 1..n are the stops.
  const N = n + 1, nodes: Point[] = [start, ...pts], D = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const d = km(nodes[i], nodes[j]); D[i * N + j] = d; D[j * N + i] = d; }
  // Short trails (12 stops or fewer): find the truly shortest order (Held-Karp). It is instant at this size.
  if (n <= 12) {
    const M = 1 << n, dp = new Float64Array(M * n).fill(Infinity), par = new Int16Array(M * n).fill(-1);
    for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = D[j + 1];                 // start -> stop j
    for (let mask = 1; mask < M; mask++) for (let last = 0; last < n; last++) {
      const cur = dp[mask * n + last]; if (cur === Infinity) continue;
      for (let nx = 0; nx < n; nx++) {
        if (mask & (1 << nx)) continue;
        const nm = mask | (1 << nx), v = cur + D[(last + 1) * N + (nx + 1)];
        if (v < dp[nm * n + nx]) { dp[nm * n + nx] = v; par[nm * n + nx] = last; }
      }
    }
    const full = M - 1; let bj = 0;
    for (let j = 1; j < n; j++) if (dp[full * n + j] < dp[full * n + bj]) bj = j;
    const seq: number[] = []; let mask = full, j = bj;
    while (j !== -1) { seq.push(j); const pj = par[mask * n + j]; mask &= ~(1 << j); j = pj; }
    return seq.reverse().map((i) => pts[i]);
  }
  // Nearest-neighbour first guess.
  const used = new Uint8Array(N); const t = [0]; used[0] = 1;
  for (let k = 0; k < n; k++) {
    const c = t[t.length - 1]; let bi = -1, bd = Infinity;
    for (let j = 1; j < N; j++) if (!used[j] && D[c * N + j] < bd) { bd = D[c * N + j]; bi = j; }
    t.push(bi); used[bi] = 1;
  }
  // 2-opt: reverse a stretch whenever it makes the walk shorter. Each check is O(1), so even 700+ stops finish instantly.
  for (let pass = 0; pass < 80; pass++) {
    let improved = false;
    for (let i = 1; i < N - 1; i++) for (let j = i + 1; j < N; j++) {
      const a = t[i - 1], b = t[i], c = t[j], d = j < N - 1 ? t[j + 1] : -1;
      const delta = D[a * N + c] + (d >= 0 ? D[b * N + d] : 0) - D[a * N + b] - (d >= 0 ? D[c * N + d] : 0);
      if (delta < -1e-9) { for (let x = i, y = j; x < y; x++, y--) { const tmp = t[x]; t[x] = t[y]; t[y] = tmp; } improved = true; }
    }
    if (!improved) break;
  }
  return t.slice(1).map((i) => pts[i - 1]);
}

/** Best visiting order for a set of stops. With a start point it is fixed; without one, the best first stop is chosen too. */
export function bestOrder<T extends Point>(start: Point | null, pts: T[]): T[] {
  if (pts.length <= 1) return [...pts];
  if (start) return plan(start, pts);
  let cands = pts;
  if (pts.length > 30) cands = [pts.reduce((a, b) => (b.lng < a.lng ? b : a)), pts.reduce((a, b) => (b.lng > a.lng ? b : a)), pts.reduce((a, b) => (b.lat > a.lat ? b : a)), pts.reduce((a, b) => (b.lat < a.lat ? b : a))];
  let best: T[] = [], bl = Infinity;
  for (const f of cands) {
    const path = [f, ...plan(f, pts.filter((q) => q !== f))]; const l = pathLen(path[0], path.slice(1));
    if (l < bl) { bl = l; best = path; }
  }
  return best;
}
