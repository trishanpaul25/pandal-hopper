// Turns data/pandals.csv (your spreadsheet export) into data/pandals.json.
//   node scripts/import-csv.mjs
// Columns: id,name,name_bn,zone,lat,lng,area,theme,source,verified,precision (precision is optional; "approx" marks a neighbourhood estimate)
// Checks for duplicate ids, missing coordinates, and points outside greater Kolkata.
import { readFileSync, writeFileSync } from "node:fs";

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---- clean-up helpers -------------------------------------------------------
const decode = (t) => t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Scraped "area" is sometimes just the club name plus a membership tag. Keep real addresses, drop the rest. */
function cleanArea(area, name) {
  let a = decode(area).replace(/\s*\((?:FFD )?Member[^)]*\)\s*$/i, "").trim();
  const bare = a.replace(/,?\s*Kolkata\s*$/i, "");
  if (!bare || norm(bare) === norm(name)) return "";
  return a;
}

const [head, ...rows] = parseCsv(readFileSync("data/pandals.csv", "utf8"));
const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
// Optional hand-checked locations: data/overrides.csv with columns id,lat,lng (and optional verified).
// Rows with an empty lat/lng are ignored, so you can fill the file in gradually.
const ov = {};
try {
  const [oh, ...orows] = parseCsv(readFileSync("data/overrides.csv", "utf8"));
  const oc = Object.fromEntries(oh.map((h, i) => [h.trim(), i]));
  for (const r of orows) {
    const id = (r[oc.id] ?? "").trim(), lat = parseFloat(r[oc.lat]), lng = parseFloat(r[oc.lng]);
    if (id && !isNaN(lat) && !isNaN(lng)) ov[id] = { lat, lng, verified: (r[oc.verified] ?? "").trim().toLowerCase() === "true" };
  }
} catch { /* no overrides file, that's fine */ }
const ovUses = {};   // two hand-entered rows at the very same point are still a placeholder
for (const o of Object.values(ov)) { const k = `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`; ovUses[k] = (ovUses[k] || 0) + 1; }
const out = [], ids = new Set(), problems = [];
const keyOf = (lat, lng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
const uses = {};   // how many pandals share each ORIGINAL point
for (const r of rows) { const la = parseFloat(r[col.lat]), ln = parseFloat(r[col.lng]); if (!isNaN(la) && !isNaN(ln)) uses[keyOf(la, ln)] = (uses[keyOf(la, ln)] || 0) + 1; }
rows.forEach((r, n) => {
  const g = (k) => (r[col[k]] ?? "").trim();
  const id = g("id"), o = ov[id], lat = o ? o.lat : parseFloat(g("lat")), lng = o ? o.lng : parseFloat(g("lng"));
  if (!id || ids.has(id)) return problems.push(`row ${n + 2}: missing or duplicate id "${id}"`);
  if (isNaN(lat) || isNaN(lng)) return problems.push(`row ${n + 2} (${id}): missing coordinates`);
  if (lat < 22.3 || lat > 22.8 || lng < 88.1 || lng > 88.6) problems.push(`row ${n + 2} (${id}): coordinates look outside Kolkata, check lat/lng order`);
  ids.add(id);
  const name = decode(g("name"));
  const p = {
    id, name, zone: g("zone") || "other", lat, lng, verified: o ? o.verified : g("verified").toLowerCase() === "true",
    precision: (g("precision").toLowerCase() === "approx" || (o ? ovUses[keyOf(o.lat, o.lng)] > 1 : uses[keyOf(parseFloat(g("lat")), parseFloat(g("lng")))] > 1)) ? "approx" : "exact"
  };   // a point shared by several pandals (or marked precision=approx in the CSV) is a placeholder, not a real pin
  const area = cleanArea(g("area"), name); if (area) p.area = area;
  for (const k of ["name_bn", "theme"]) if (g(k)) p[k] = decode(g(k));
  out.push(p);
});
writeFileSync("data/pandals.json", JSON.stringify(out, null, 1));
const fixed = Object.keys(ov).filter((k) => ids.has(k)).length;
if (fixed) console.log(`Applied ${fixed} hand-checked locations from data/overrides.csv.`);
const approx = out.filter((p) => p.precision === "approx").length;
console.log(`Wrote ${out.length} pandals: ${out.length - approx} with a real pin, ${approx} with a placeholder location (kept out of routes and navigation).`);
if (problems.length) console.log("Check these:\n - " + problems.join("\n - "));
