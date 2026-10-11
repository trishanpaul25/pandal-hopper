// Precomputes ready-made routes and writes data/routes.json.
// Each zone is split into circuits of about 12 nearby pandals, ordered to keep walking short.
// Pandals with a placeholder location (precision "approx") are left out.
// Straight-line x1.3 distances by default. For real walking distances run an OSRM server:
//   OSRM_URL=http://localhost:5000 npm run routes
import { readFileSync, writeFileSync } from "node:fs";

const SIZE = 12, MIN_SIZE = 4;
const pandals = JSON.parse(readFileSync("data/pandals.json", "utf8")).filter((p) => p.precision !== "approx");

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
  const j = await (await fetch(`${base}/table/v1/foot/${coords}?annotations=distance`)).json();
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
const label = (z) => ({ north: "North Kolkata", south: "South Kolkata", central: "Central Kolkata", east: "East Kolkata", west: "South-west", howrah: "Howrah", bonedi: "Bonedi Bari", others: "Other areas", other: "Other areas" }[z] ?? z[0].toUpperCase() + z.slice(1));

const zones = {};
for (const p of pandals) (zones[p.zone] ??= []).push(p);
const out = [];
for (const [z, pts] of Object.entries(zones)) {
  let left = [...pts], n = 1;
  const groups = [];
  while (left.length) {
    const start = left.reduce((b, p) => (p.lat > b.lat ? p : b), left[0]);
    const group = left.map((p) => ({ p, d: hav(start, p) })).sort((a, b) => a.d - b.d).slice(0, SIZE).map((x) => x.p);
    left = left.filter((p) => !group.includes(p));
    if (group.length < MIN_SIZE && groups.length) groups[groups.length - 1].push(...group); else groups.push(group);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    const D = await matrix(group);
    const startIdx = group.reduce((bi, p, i) => (p.lat > group[bi].lat ? i : bi), 0);
    const { path, km } = order(D, startIdx);
    const first = group[path[0]];
    out.push({ id: `${z}-${n}`, zone: z, name: `${label(z)} circuit ${n}`, blurb: `Starts at ${first.name}.`, ids: path.map((i) => group[i].id), km: +km.toFixed(1), start: { lat: first.lat, lng: first.lng } });
    n++;
  }
}
writeFileSync("data/routes.json", JSON.stringify(out, null, 1));
console.log(`Wrote ${out.length} routes from ${pandals.length} pandals`);
