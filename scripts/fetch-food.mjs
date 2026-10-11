// Pulls restaurants, cafes, snack stalls, sweet shops and bakeries from OpenStreetMap
// (Overpass API) that are close to your pandals, and merges them into data/places.json.
// Your hand-written entries (ids that don't start with "osm-") are kept as they are.
//
// Usage (needs internet, takes a few minutes):
//   npm run food
//   MAX_M=400 MAX_TOTAL=1500 npm run food      # tighter radius / smaller file
//   MAX_M=2000 MAX_TOTAL=4000 npm run food    # wider radius (over 1000 m re-downloads everything once)
//   FRESH=1 npm run food                       # ignore saved progress and download everything again
//
// Progress is saved after every area in data/.food-cache.json. If the free service says "busy",
// just run the command again: finished areas are skipped and only the missing ones are fetched.
//
// Data © OpenStreetMap contributors (ODbL). The app shows this credit on the Food page.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_M = Number(process.env.MAX_M || 500);        // keep places within this many metres of some pandal
const MAX_TOTAL = Number(process.env.MAX_TOTAL || 2500); // cap, so the app stays fast on phones
const TILE = 0.06;                                      // query size in degrees (~6 km)
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const SLOW = process.env.FOOD_FAST ? 0 : 1; // FOOD_FAST is only for testing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
const CACHE = "data/.food-cache.json";
const R = Math.PI / 180;
export const meters = (a, b) => {
    const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

const LABEL = { restaurant: "Restaurant", cafe: "Café", fastfood: "Snacks and fast food", sweets: "Sweets and bakery" };
function kindOf(t) {
    if (t.amenity === "restaurant" || t.amenity === "food_court") return "restaurant";
    if (t.amenity === "cafe") return "cafe";
    if (t.amenity === "fast_food") return "fastfood";
    if (t.amenity === "ice_cream" || ["confectionery", "bakery", "sweets"].includes(t.shop)) return "sweets";
    return null;
}
const title = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** One Overpass element -> one place for the app (or null if it has no name or location). */
export function toPlace(el) {
    const t = el.tags || {}; const name = (t.name || t["name:en"] || "").trim();
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    const kind = kindOf(t);
    if (!name || lat == null || lng == null || !kind) return null;
    const cuisine = t.cuisine ? t.cuisine.split(";").slice(0, 3).map((c) => title(c.trim())).join(", ") : "";
    const place = {
        id: `osm-${el.type[0]}${el.id}`, name, type: "food", kind,
        lat: +lat.toFixed(6), lng: +lng.toFixed(6),
        note: LABEL[kind] + (cuisine ? ` · ${cuisine}` : ""), verified: false,
    };
    if (t["name:bn"]) place.name_bn = t["name:bn"].trim();
    return place;
}

/** Fast "how far is the closest pandal" using 0.01 degree cells (~1 km each). Looks 1 cell out per km of radius. */
export function makeNearest(pandals, maxM = 1000) {
    const reach = Math.max(1, Math.ceil(maxM / 1000));
    const cells = {}; const key = (lat, lng) => `${Math.floor(lat / 0.01)},${Math.floor(lng / 0.01)}`;
    pandals.forEach((p) => (cells[key(p.lat, p.lng)] ||= []).push(p));
    return (pt) => {
        let best = Infinity; const cy = Math.floor(pt.lat / 0.01), cx = Math.floor(pt.lng / 0.01);
        for (let y = cy - reach; y <= cy + reach; y++) for (let x = cx - reach; x <= cx + reach; x++)
            for (const p of cells[`${y},${x}`] || []) best = Math.min(best, meters(pt, p));
        return best;
    };
}

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
const queryFor = (s, w, n, e) => `[out:json][timeout:90];(
  nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"]["name"](${s},${w},${n},${e});
  nwr["shop"~"^(confectionery|bakery|sweets)$"]["name"](${s},${w},${n},${e});
);out center tags;`;

export async function main() {
    const pandals = JSON.parse(readFileSync("data/pandals.json", "utf8"));
    const existing = JSON.parse(readFileSync("data/places.json", "utf8"));
    const curated = existing.filter((p) => !String(p.id).startsWith("osm-"));
    const nearest = makeNearest(pandals, MAX_M);
    const pad = MAX_M > 1000 ? MAX_M / 111000 + 0.001 : 0.006; // how far past each area edge to look (degrees). Bigger radius = bigger areas.

    // Only ask for areas that actually have pandals.
    const tiles = {};
    pandals.forEach((p) => { tiles[`${Math.floor(p.lat / TILE)},${Math.floor(p.lng / TILE)}`] = [Math.floor(p.lat / TILE), Math.floor(p.lng / TILE)]; });
    const list = Object.values(tiles);
    console.log(`${pandals.length} pandals in ${list.length} areas. Fetching food places from OpenStreetMap...`);

    // Each finished area is saved right away, so a "busy" error never loses work.
    let cache = {};
    try { if (!process.env.FRESH) cache = JSON.parse(readFileSync(CACHE, "utf8")); } catch { /* first run */ }
    if ((cache._pad ?? 0.006) < pad - 1e-9) { console.log(`A radius of ${MAX_M} m needs wider areas than the saved download, so everything will be downloaded again.`); cache = {}; }
    cache._pad = pad;
    const failed = []; let i = 0;
    for (const [ty, tx_] of list) {
        i++; const k = `${ty},${tx_}`;
        if (cache[k]) { console.log(`  area ${i}/${list.length}: saved from an earlier run (${cache[k].length} places), skipping`); continue; }
        let els;
        try { els = await overpass(queryFor(ty * TILE - pad, tx_ * TILE - pad, (ty + 1) * TILE + pad, (tx_ + 1) * TILE + pad)); }
        catch (e) { console.log(`  area ${i}/${list.length}: FAILED (${e.message}). Will carry on and you can re-run later.`); failed.push(k); await sleep(20000); continue; }
        cache[k] = els.map(toPlace).filter(Boolean);
        writeFileSync(CACHE, JSON.stringify(cache));
        console.log(`  area ${i}/${list.length}: ${els.length} results, ${cache[k].length} food places saved`);
        await sleep(2500); // be polite to the free service
    }
    const found = {};
    Object.entries(cache).forEach(([k, arr]) => { if (!k.startsWith("_")) arr.forEach((p) => { found[p.id] = p; }); });

    // Keep only places near a pandal, closest first, no duplicates, capped.
    const curatedNames = new Set(curated.map((p) => p.name.toLowerCase()));
    const seen = new Set(); const scored = [];
    for (const p of Object.values(found)) {
        const d = nearest(p); if (d > MAX_M) continue;
        const k = `${p.name.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
        if (seen.has(k) || curatedNames.has(p.name.toLowerCase())) continue;
        seen.add(k); scored.push({ p, d });
    }
    scored.sort((a, b) => a.d - b.d);
    const osm = scored.slice(0, MAX_TOTAL).map((x) => x.p).sort((a, b) => a.name.localeCompare(b.name));

    const out = [...curated, ...osm];
    writeFileSync("data/places.json", "[\n" + out.map((p) => JSON.stringify(p)).join(",\n") + "\n]\n");
    const by = osm.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {});
    console.log(`\nWrote data/places.json: ${curated.length} hand-picked + ${osm.length} from OpenStreetMap`, by);
    if (failed.length) console.log(`\n${failed.length} of ${list.length} areas could not be fetched, so this list is incomplete.\nRun "npm run food" again in a few minutes: it will only fetch the missing areas.`);
    else console.log("\nAll areas fetched.");
    if (scored.length > MAX_TOTAL) console.log(`(${scored.length - MAX_TOTAL} more were found but skipped. Raise MAX_TOTAL to keep them.)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
