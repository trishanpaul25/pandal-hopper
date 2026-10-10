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
export const walkMins = (d: number) => Math.max(1, Math.round(d * 12)); // ~5 km/h
export const fmtDist = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

export function pathLen<T extends Point>(start: Point, arr: T[]): number {
  let s = 0, p: Point = start;
  for (const q of arr) { s += km(p, q); p = q; }
  return s;
}

/** Nearest neighbour first, then 2-opt to remove crossings. Start point is fixed. */
export function plan<T extends Point>(start: Point, pts: T[]): T[] {
  const left = [...pts]; let path: T[] = []; let cur: Point = start;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((q, i) => { const d = km(cur, q); if (d < bd) { bd = d; bi = i; } });
    const [next] = left.splice(bi, 1); path.push(next); cur = next;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++) {
      const cand = path.slice(0, i).concat(path.slice(i, j + 1).reverse(), path.slice(j + 1));
      if (pathLen(start, cand) < pathLen(start, path) - 1e-9) { path = cand; improved = true; }
    }
  }
  return path;
}
