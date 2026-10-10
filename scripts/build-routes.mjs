// Precomputes ordered routes and writes data/routes.json.
// Uses straight-line x1.3 distances by default.
// For real walking distances run an OSRM server and set OSRM_URL, e.g.
//   OSRM_URL=http://localhost:5000 npm run routes
import { readFileSync, writeFileSync } from "node:fs";

const pandals = JSON.parse(readFileSync("data/pandals.json", "utf8"));

// Edit this list to define the routes shown in the app.
const DEFS = [
  { id: "north", name: "North Kolkata heritage", blurb: "Old, big-budget community pujas.", zones: ["north"] },
  { id: "south", name: "South Kolkata themes", blurb: "Theme pandals, best after dusk.", zones: ["south"] },
  { id: "south-west", name: "South and beyond", blurb: "Adds Behala and Naktala. Plan a cab between some stops.", zones: ["south", "west"] },
];

const R = Math.PI / 180;
const hav = (a, b) => {
  const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
};

async function matrix(pts) {
  const base = process.env.OSRM_URL;
  if (!base) return pts.map((a) => pts.map((b) => hav(a, b)));
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
  const res = await fetch(`${base}/table/v1/foot/${coords}?annotations=distance`);
  const j = await res.json();
  return j.distances.map((row) => row.map((m) => m / 1000));
}

function order(D, startIdx) {
  const n = D.length, left = new Set([...Array(n).keys()].filter((i) => i !== startIdx));
  let path = [startIdx], cur = startIdx;
  while (left.size) {
    let best = -1, bd = Infinity;
    for (const j of left) if (D[cur][j] < bd) { bd = D[cur][j]; best = j; }
    path.push(best); left.delete(best); cur = best;
  }
  const len = (p) => p.slice(1).reduce((s, x, i) => s + D[p[i]][x], 0);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++) {
      const cand = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
      if (len(cand) < len(path) - 1e-9) { path = cand; improved = true; }
    }
  }
  return { path, km: len(path) };
}

const out = [];
for (const d of DEFS) {
  const pts = pandals.filter((p) => d.zones.includes(p.zone));
  if (pts.length < 2) continue;
  const D = await matrix(pts);
  const startIdx = pts.reduce((bi, p, i) => (p.lat > pts[bi].lat ? i : bi), 0); // start at the northern end
  const { path, km } = order(D, startIdx);
  out.push({ id: d.id, name: d.name, blurb: d.blurb, ids: path.map((i) => pts[i].id), km: +km.toFixed(1) });
}
writeFileSync("data/routes.json", JSON.stringify(out, null, 1));
console.log(`Wrote ${out.length} routes`);
