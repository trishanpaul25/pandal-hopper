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
export type WalkRoute = { coords: Point[]; km: number; mins: number; approx: boolean };
/** Real walking route from OSM's public foot router. Falls back to a straight line if offline or blocked. */
export async function walkRoute(a: Point, b: Point): Promise<WalkRoute> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const j = await (await fetch(url, { signal: ctrl.signal })).json();
    const r = j.routes?.[0]; if (!r) throw new Error("no route");
    return { coords: r.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })), km: r.distance / 1000, mins: Math.max(1, Math.round(r.distance / 83)), approx: false };
  } catch {
    const d = km(a, b); return { coords: [a, b], km: d, mins: walkMins(d), approx: true };
  } finally { clearTimeout(t); }
}
/** Compass bearing in degrees (0 = north) from a to b. */
export function bearing(a: Point, b: Point): number {
  const y = Math.sin((b.lng - a.lng) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lng - a.lng) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}
export type ViaRoute = { coords: Point[]; legs: number[]; km: number; mins: number; approx: boolean };
/** One walking route through several points in order. legs[i] is the km from point i to point i+1. Falls back to straight lines. */
export async function walkRouteVia(pts: Point[]): Promise<ViaRoute> {
  const straight = (): ViaRoute => {
    const legs = pts.slice(1).map((q, i) => km(pts[i], q)); const total = legs.reduce((a, b) => a + b, 0);
    return { coords: pts, legs, km: total, mins: walkMins(total), approx: true };
  };
  if (pts.length < 2) return { coords: pts, legs: [], km: 0, mins: 0, approx: false };
  try {
    const coords: Point[] = []; const legs: number[] = [];
    for (let i = 0; i < pts.length - 1; i += 24) {           // the public router takes ~25 points per request
      const chunk = pts.slice(i, i + 25); if (chunk.length < 2) break;
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${chunk.map((q) => `${q.lng},${q.lat}`).join(";")}?overview=full&geometries=geojson`;
        const j = await (await fetch(url, { signal: ctrl.signal })).json();
        const r = j.routes?.[0]; if (!r) throw new Error("no route");
        const c: Point[] = r.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng }));
        coords.push(...(coords.length ? c.slice(1) : c));
        r.legs.forEach((l: { distance: number }) => legs.push(l.distance / 1000));
      } finally { clearTimeout(t); }
    }
    const total = legs.reduce((a, b) => a + b, 0);
    return { coords, legs, km: total, mins: Math.max(1, Math.round((total * 1000) / 83)), approx: false };
  } catch { return straight(); }
}
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
