import type { Point } from "./types";
const R = Math.PI / 180;

/** Straight-line distance x1.3 as a rough road-distance estimate. */
export function km(a: Point, b: Point): number {
  const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
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
