// Downloads Kolkata metro and train stations from OpenStreetMap (Overpass API) into data/transit.json.
// For metro it also tries to read the line order (which station comes after which), so the app can count stops.
// If the lines can't be read, the app still works: it estimates the ride from the distance.
//
// Usage (needs internet, takes about a minute):
//   npm run transit
// Run it once, check the numbers it prints, then commit data/transit.json.
//
// Data © OpenStreetMap contributors (ODbL).
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = Math.PI / 180;
const meters = (a, b) => {
    const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
async function overpass(query) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const url = ENDPOINTS[attempt % ENDPOINTS.length];
        try {
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "pandal-hopper/0.1" }, body: "data=" + encodeURIComponent(query) });
            if (res.ok) return (await res.json()).elements || [];
            console.log(`  ${new URL(url).host} said ${res.status}, retrying...`);
        } catch (e) { console.log(`  ${e.message}, retrying...`); }
        await sleep(5000 * (attempt + 1));
    }
    throw new Error("Overpass is busy right now. Try again in a few minutes.");
}

const centre = (e) => (e.lat != null ? { lat: e.lat, lng: e.lon } : e.center ? { lat: e.center.lat, lng: e.center.lon } : null);
const nameOf = (t = {}) => (t["name:en"] || t.name || "").trim();

/** Turns Overpass elements into the file the app reads. Pure function, so it can be tested without internet. */
export function build(metroEls, railEls, lineEls) {
    // Stations: one entry per name within 300 m (OSM often has a node and a building for the same station).
    const pick = (els, prefix) => {
        const out = [];
        for (const e of els) {
            const c = centre(e), name = nameOf(e.tags);
            if (!c || !name) continue;
            if (out.some((s) => s.name.toLowerCase() === name.toLowerCase() && meters(s, c) < 300)) continue;
            out.push({ id: `${prefix}-${e.type[0]}${e.id}`, name, lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5) });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    };
    const metro = pick(metroEls, "metro"), rail = pick(railEls, "rail");

    // Lines: for each route relation, list its stops in order and match each stop to the closest metro station (within 400 m).
    const nodes = new Map(lineEls.filter((e) => e.type === "node").map((e) => [e.id, e]));
    const nearestStation = (c) => { let best = null, bd = 400; for (const s of metro) { const d = meters(s, c); if (d < bd) { bd = d; best = s; } } return best; };
    const lines = new Map(); // line name -> longest ordered list of station ids
    for (const rel of lineEls.filter((e) => e.type === "relation")) {
        const members = (rel.members || []).filter((m) => m.type === "node");
        const stops = members.filter((m) => /^stop/.test(m.role));
        const use = stops.length ? stops : members.filter((m) => m.role === "platform");
        const ids = [];
        for (const m of use) {
            const n = nodes.get(m.ref); if (!n) continue;
            const s = nearestStation({ lat: n.lat, lng: n.lon }); if (!s) continue;
            if (ids[ids.length - 1] !== s.id) ids.push(s.id);
        }
        const t = rel.tags || {};
        const key = (t.name || "").split(/[:：]/)[0].trim() || t.ref || t.colour || "Metro line";
        if (ids.length > (lines.get(key)?.length || 0)) lines.set(key, ids);
    }
    const byId = new Map(metro.map((s) => [s.id, s]));
    for (const [key, ids] of lines) ids.forEach((id, i) => { const s = byId.get(id); if (s) (s.lines ||= []).push({ l: key, i }); });
    return { metro, rail, lineNames: [...lines.keys()] };
}

export async function main() {
    const pandals = JSON.parse(readFileSync("data/pandals.json", "utf8")).filter((p) => p.precision !== "approx" && p.lat && p.lng);
    const pad = 0.06;
    const s = Math.min(...pandals.map((p) => p.lat)) - pad, n = Math.max(...pandals.map((p) => p.lat)) + pad;
    const w = Math.min(...pandals.map((p) => p.lng)) - pad, e = Math.max(...pandals.map((p) => p.lng)) + pad;
    const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
    console.log(`Area: ${bb}`);

    console.log("Metro stations...");
    const metroEls = await overpass(`[out:json][timeout:90];(
  nwr["railway"="station"]["station"="subway"]["name"](${bb});
  nwr["railway"="station"]["subway"="yes"]["name"](${bb});
  nwr["public_transport"="station"]["subway"="yes"]["name"](${bb});
);out center tags;`);
    await sleep(3000);
    console.log("Train stations...");
    const railEls = await overpass(`[out:json][timeout:90];(
  nwr["railway"~"^(station|halt)$"]["name"]["station"!="subway"]["subway"!="yes"]["station"!="light_rail"]["station"!="monorail"](${bb});
);out center tags;`);
    await sleep(3000);
    console.log("Metro lines...");
    let lineEls = [];
    try { lineEls = await overpass(`[out:json][timeout:120];relation["route"="subway"](${bb});out body;>;out skel qt;`); }
    catch (err) { console.log("  Couldn't read the lines (" + err.message + "). Continuing without them."); }

    const out = build(metroEls, railEls, lineEls);
    const noLine = out.metro.filter((m) => !m.lines);
    writeFileSync("data/transit.json", JSON.stringify({ metro: out.metro, rail: out.rail }));
    console.log(`\nSaved data/transit.json`);
    console.log(`  metro stations: ${out.metro.length}`);
    console.log(`  train stations: ${out.rail.length}`);
    console.log(`  metro lines read: ${out.lineNames.length}${out.lineNames.length ? " (" + out.lineNames.join(", ") + ")" : ""}`);
    if (noLine.length) console.log(`  ${noLine.length} metro stations have no line info (time uses distance): ${noLine.slice(0, 8).map((m) => m.name).join(", ")}${noLine.length > 8 ? ", ..." : ""}`);
    if (!out.metro.length) console.log("  WARNING: no metro stations found, so the Metro option will stay hidden.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
