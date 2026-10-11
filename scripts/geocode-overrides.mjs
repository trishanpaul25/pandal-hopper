// Tries to find coordinates for the pandals listed in data/overrides.csv, using OpenStreetMap's Nominatim.
// Run on YOUR computer (Node 18+):
//
//   set NOMINATIM_EMAIL=you@example.com      (Windows PowerShell:  $env:NOMINATIM_EMAIL="you@example.com")
//   node scripts/geocode-overrides.mjs --limit 10      # try 10 first and look at the result
//   node scripts/geocode-overrides.mjs                 # all rows that still have blank lat/lng
//   node scripts/geocode-overrides.mjs --apply         # also fill the good ones into overrides.csv
//
// Rules this script follows (Nominatim's usage policy): one request per second, a User-Agent with your
// contact email, and every answer is cached in data/.geocode-cache.json so nothing is asked twice.
//
// IMPORTANT: results come from address text, so they are street-level guesses, not the pandal gate.
// Nothing is ever marked verified. Anything two pandals "found" at the same spot is thrown away.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

const BASE = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const DELAY = +(process.env.DELAY_MS || 1100);
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const EMAIL = process.env.NOMINATIM_EMAIL || val("--email");
const LIMIT = val("--limit") ? parseInt(val("--limit"), 10) : Infinity;
const APPLY = flag("--apply");
if (!EMAIL) { console.log("Please tell Nominatim who you are. Set NOMINATIM_EMAIL=you@example.com (or use --email you@example.com)."); process.exit(1); }

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
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CACHE_FILE = "data/.geocode-cache.json";
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
let calls = 0;

async function ask(q) {
    if (q in cache) return cache[q];
    if (calls++) await sleep(DELAY);                       // never faster than about 1 request per second
    const url = new URL(BASE);
    url.search = new URLSearchParams({
        q, format: "jsonv2", limit: "1", countrycodes: "in", email: EMAIL,
        viewbox: "88.15,22.75,88.55,22.35", bounded: "1",    // only look inside greater Kolkata
    });
    const res = await fetch(url, { headers: { "User-Agent": `PandalHopperGeocoder/0.1 (${EMAIL})`, "Accept-Language": "en" } });
    if (res.status === 429 || res.status === 403) { writeFileSync(CACHE_FILE, JSON.stringify(cache)); throw new Error(`Nominatim said ${res.status}. Stop, wait an hour, and run again (answers so far are saved).`); }
    const j = res.ok ? await res.json() : [];
    const r = j[0] ? { lat: +j[0].lat, lng: +j[0].lon, rank: j[0].place_rank ?? 0, name: j[0].display_name ?? "" } : null;
    cache[q] = r;
    return r;
}

/** Try the address, then the address without its house/building part, then (if there is no address) the club name. */
async function find(name, area) {
    const tries = [];
    if (area) {
        tries.push(area);
        const parts = area.split(",").map((s) => s.trim());
        if (parts.length >= 3) tries.push(parts.slice(1).join(", "));
    } else tries.push(`${name}, Kolkata`);
    for (const q of tries) { const r = await ask(q); if (r) return { ...r, q }; }
    return null;
}

const [head, ...rows] = parseCsv(readFileSync("data/overrides.csv", "utf8"));
const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
const todo = rows.filter((r) => !(parseFloat(r[col.lat]) && parseFloat(r[col.lng]))).slice(0, LIMIT);
console.log(`${todo.length} pandals to look up. About ${Math.ceil((todo.length * 1.2 * DELAY) / 60000)} minutes.`);

const found = [];
let n = 0;
for (const r of todo) {
    const id = r[col.id], name = r[col.name], area = r[col.area];
    const hit = await find(name, area);
    n++;
    const tag = !hit ? "no match" : hit.rank >= 28 ? "building" : hit.rank >= 26 ? "street" : "too coarse";
    console.log(`${String(n).padStart(3)}/${todo.length}  ${(tag === "building" || tag === "street" ? "found" : tag).padEnd(10)} ${name}`);   // "found" may still be dropped below if two pandals land on one spot
    found.push({ id, name, area, hit, tag });
}
writeFileSync(CACHE_FILE, JSON.stringify(cache));

// Two pandals "found" at the same spot means the geocoder only knew the street or area: don't trust either.
const spot = {};
for (const f of found) if (f.hit && (f.tag === "building" || f.tag === "street")) { const k = `${f.hit.lat.toFixed(5)},${f.hit.lng.toFixed(5)}`; (spot[k] ??= []).push(f); }
for (const list of Object.values(spot)) if (list.length > 1) for (const f of list) f.tag = "shared spot";

const good = found.filter((f) => f.tag === "building" || f.tag === "street");
const out = ["id,name,area,lat,lng,verified,confidence,matched_as,query"].concat(found.map((f) =>
    [f.id, f.name, f.area, f.hit && (f.tag === "building" || f.tag === "street") ? f.hit.lat : "", f.hit && (f.tag === "building" || f.tag === "street") ? f.hit.lng : "", "false", f.tag, f.hit?.name ?? "", f.hit?.q ?? ""].map(csvCell).join(",")));
writeFileSync("data/overrides.suggested.csv", out.join("\n"));

const count = (t) => found.filter((f) => f.tag === t).length;
console.log(`\nDone. building: ${count("building")}, street: ${count("street")}, shared spot (dropped): ${count("shared spot")}, too coarse (dropped): ${count("too coarse")}, no match: ${count("no match")}`);
console.log("Review data/overrides.suggested.csv (the matched_as column shows what Nominatim thought it found).");

if (APPLY) {
    const byId = Object.fromEntries(good.map((f) => [f.id, f]));
    copyFileSync("data/overrides.csv", "data/overrides.csv.bak");
    let filled = 0;
    const outRows = [head, ...rows].map((r, i) => {
        if (i === 0) return r;
        const f = byId[r[col.id]];
        if (f && !(parseFloat(r[col.lat]) && parseFloat(r[col.lng]))) { r = [...r]; r[col.lat] = f.hit.lat.toFixed(6); r[col.lng] = f.hit.lng.toFixed(6); r[col.verified] = "false"; filled++; }
        return r;
    });
    writeFileSync("data/overrides.csv", outRows.map((r) => r.map(csvCell).join(",")).join("\n"));
    console.log(`Filled ${filled} rows in data/overrides.csv (backup: data/overrides.csv.bak). They are marked verified=false. Now run: npm run import`);
}
