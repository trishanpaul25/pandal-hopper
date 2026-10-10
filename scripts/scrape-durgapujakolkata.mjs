// Polite scraper for the pandal list on durgapujakolkata.in.
// Run this on YOUR computer (Node 18+). Only use it with the site owner's OK.
//
//   node scripts/scrape-durgapujakolkata.mjs --probe          # test 3 pages, show what was found
//   node scripts/scrape-durgapujakolkata.mjs --run            # scrape everything
//   node scripts/scrape-durgapujakolkata.mjs --run --limit 40 # scrape only the first 40
//
// Output: data/pandals.scraped.csv  (review it, then copy rows into data/pandals.csv and run `npm run import`)
//
// What it takes: only plain facts (name, area, zone, coordinates, source URL).
// It does not download photos, descriptions or ratings, and it marks every row verified=false.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = "https://www.durgapujakolkata.in";
const UA = "PandalHopperBot/0.1 (personal project; contact: set-your-email-here)";
const DELAY_MS = 1500;           // one request every 1.5 s, so 700 pages take about 18 minutes
const CACHE = "data/.scrape-cache";
const args = process.argv.slice(2);
const PROBE = args.includes("--probe");
const RUN = args.includes("--run");
const LIMIT = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : Infinity;
if (!PROBE && !RUN) { console.log("Use --probe or --run (see the top of this file)."); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(CACHE, { recursive: true });

async function get(url) {
  const file = `${CACHE}/${Buffer.from(url).toString("base64url").slice(0, 120)}.html`;
  if (existsSync(file)) return readFileSync(file, "utf8");     // resume support
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml" } });
  if (res.status === 429 || res.status === 403) throw new Error(`${res.status} from ${url}. Stop and ask the owner.`);
  if (!res.ok) return "";
  const text = await res.text();
  writeFileSync(file, text);
  return text;
}

// 1. Respect robots.txt
async function allowed(path) {
  const txt = await get(`${BASE}/robots.txt`);
  let applies = false, disallow = [];
  for (const raw of txt.split("\n")) {
    const line = raw.trim();
    if (/^user-agent:\s*\*/i.test(line)) applies = true;
    else if (/^user-agent:/i.test(line)) applies = false;
    else if (applies && /^disallow:/i.test(line)) { const v = line.split(":")[1]?.trim(); if (v) disallow.push(v); }
  }
  return !disallow.some((d) => path.startsWith(d));
}

// 2. Find pandal page URLs from the sitemap
async function pandalUrls() {
  const seen = new Set(), out = [];
  const queue = [`${BASE}/sitemap.xml`];
  while (queue.length) {
    const xml = await get(queue.shift());
    for (const [, loc] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      if (seen.has(loc)) continue; seen.add(loc);
      if (/\.xml(\?|$)/.test(loc)) queue.push(loc);
      else if (/\/paras\/[^/?#]+$/.test(loc)) out.push(loc);
    }
  }
  return out;
}

// 3. Pull plain facts out of one page. Next.js pages embed their data as JSON in the HTML.
function extract(html, url) {
  const t = html.replace(/\\"/g, '"');                         // unescape embedded JSON strings
  const pick = (re) => t.match(re)?.[1]?.trim();
  const num = (keys) => { const v = pick(new RegExp(`"(?:${keys})"\\s*:\\s*"?(-?\\d{1,3}\\.\\d{3,})`)); return v ? parseFloat(v) : NaN; };
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const geo = ld.flatMap((x) => (Array.isArray(x) ? x : [x])).find((x) => x?.geo)?.geo;
  const og = pick(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) || pick(/<title>([^<]+)<\/title>/);
  const h1 = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.replace(/<[^>]+>/g, "");
  return {
    id: url.split("/").pop(),
    name: (h1 || og || "").replace(/\s*[|–—-]\s*Durga Puja Kolkata.*$/i, "").trim(),
    zone: pick(/"zone"\s*:\s*"([a-z-]+)"/i) || "other",
    area: pick(/"(?:area|locality|landmark|neighbourhood)"\s*:\s*"([^"]{2,80})"/i) || "",
    lat: geo?.latitude ? parseFloat(geo.latitude) : num("lat|latitude"),
    lng: geo?.longitude ? parseFloat(geo.longitude) : num("lng|lon|long|longitude"),
    source: url,
  };
}

const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

(async () => {
  if (!(await allowed("/paras"))) { console.log("robots.txt asks bots not to fetch /paras. Stopping. Ask the owner to allow it or to share the data directly."); return; }
  const urls = await pandalUrls();
  console.log(`Found ${urls.length} pandal pages in the sitemap.`);
  if (!urls.length) { console.log("No sitemap entries under /paras/. Open the site, find the list page, and adapt pandalUrls()."); return; }

  const rows = [];
  for (const [i, url] of urls.slice(0, PROBE ? 3 : LIMIT).entries()) {
    const html = await get(url);
    const r = extract(html, url);
    rows.push(r);
    if (PROBE) console.log(r, "\nkeys mentioning lat/lng:", [...new Set([...html.replace(/\\"/g, '"').matchAll(/"([A-Za-z_]*(?:lat|lng|lon)[A-Za-z_]*)"\s*:/gi)].map((m) => m[1]))]);
    else if ((i + 1) % 25 === 0) console.log(`${i + 1}/${urls.length}`);
  }
  if (PROBE) { console.log("\nIf lat/lng are NaN, look at the 'keys' list above and add that key name inside extract()."); return; }

  const good = rows.filter((r) => r.name && !isNaN(r.lat) && !isNaN(r.lng));
  const head = "id,name,name_bn,zone,lat,lng,area,theme,source,verified";
  writeFileSync("data/pandals.scraped.csv", [head, ...good.map((r) => [r.id, r.name, "", r.zone, r.lat, r.lng, r.area, "", r.source, "false"].map(csv).join(","))].join("\n"));
  console.log(`Wrote ${good.length} rows to data/pandals.scraped.csv. ${rows.length - good.length} pages had no coordinates and were skipped.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
