// Turns data/pandals.csv (your spreadsheet export) into data/pandals.json.
//   node scripts/import-csv.mjs
// Columns: id,name,name_bn,zone,lat,lng,area,theme,source,verified
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

const [head, ...rows] = parseCsv(readFileSync("data/pandals.csv", "utf8"));
const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
const out = [], ids = new Set(), problems = [];
rows.forEach((r, n) => {
  const g = (k) => (r[col[k]] ?? "").trim();
  const id = g("id"), lat = parseFloat(g("lat")), lng = parseFloat(g("lng"));
  if (!id || ids.has(id)) return problems.push(`row ${n + 2}: missing or duplicate id "${id}"`);
  if (isNaN(lat) || isNaN(lng)) return problems.push(`row ${n + 2} (${id}): missing coordinates`);
  if (lat < 22.3 || lat > 22.8 || lng < 88.1 || lng > 88.6) problems.push(`row ${n + 2} (${id}): coordinates look outside Kolkata, check lat/lng order`);
  ids.add(id);
  const p = { id, name: g("name"), zone: g("zone") || "other", lat, lng, verified: g("verified").toLowerCase() === "true" };
  for (const k of ["name_bn", "area", "theme"]) if (g(k)) p[k] = g(k);
  out.push(p);
});
writeFileSync("data/pandals.json", JSON.stringify(out, null, 1));
console.log(`Wrote ${out.length} pandals.`);
if (problems.length) console.log("Check these:\n - " + problems.join("\n - "));
