import type { Pandal, Point } from "./types";
import { fmtDist, km } from "./geo";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);
export const mapsLink = (p: Point) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
const primary = (p: Pandal, bn: boolean) => (bn && p.name_bn) || p.name;
const second = (p: Pandal, bn: boolean) => (bn ? (p.name_bn ? p.name : "") : p.name_bn ?? "");

/** Plain-text version of a plan, for the Share button (WhatsApp etc.). */
export function planText(title: string, stops: Pandal[], bn: boolean): string {
  return [title, "", ...stops.map((p, i) => `${i + 1}. ${primary(p, bn)}${p.area ? ` (${p.area})` : ""}\n   ${mapsLink(p)}`)].join("\n");
}

/** Opens a clean, printable page and starts the print dialog. Choose "Save as PDF" there, then share the file with friends.
 *  Returns false if the browser blocked the new window. */
export function exportPdf(o: { title: string; stops: Pandal[]; start: Point | null; bn: boolean }): boolean {
  const { title, stops, start, bn } = o;
  const legs = stops.map((p, i) => (i === 0 ? (start ? km(start, p) : null) : km(stops[i - 1], p)));
  const total = legs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const L = bn
    ? { n: "#", name: "প্যান্ডেল", area: "এলাকা", dist: "দূরত্ব", map: "ম্যাপ", open: "ম্যাপে খুলুন", stops: "টি স্টপ", walk: "আনুমানিক হাঁটা", from: "শুরু থেকে", note: "দূরত্ব আনুমানিক। যাওয়ার আগে সময় ও ভিড় দেখে নিন।", made: "Pandal Hopper দিয়ে তৈরি" }
    : { n: "#", name: "Pandal", area: "Area", dist: "From previous", map: "Map", open: "Open map", stops: "stops", walk: "approx. walk", from: "from start", note: "Distances are estimates. Check timings and crowds before you go.", made: "Made with Pandal Hopper" };
  const rows = stops.map((p, i) => `<tr>
    <td class="n">${i + 1}</td>
    <td><b>${esc(primary(p, bn))}</b>${second(p, bn) ? `<div class="s">${esc(second(p, bn))}</div>` : ""}</td>
    <td>${esc(p.area ?? "")}</td>
    <td class="d">${legs[i] === null ? "–" : "~" + fmtDist(legs[i] as number)}${i === 0 && start ? `<div class="s">${L.from}</div>` : ""}</td>
    <td><a href="${mapsLink(p)}">${L.open}</a></td></tr>`).join("");
  const date = new Date().toLocaleDateString(bn ? "bn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });
  const html = `<!doctype html><html lang="${bn ? "bn" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
@page{margin:14mm}
body{font:14px/1.45 system-ui,"Noto Sans Bengali","Segoe UI",Arial,sans-serif;color:#2a0a0e;margin:0;padding:16px}
h1{font-size:24px;margin:0 0 4px;color:#9b0f1b}.meta{color:#6b6258;margin:0 0 14px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b6258;border-bottom:2px solid #c1121f;padding:6px}
td{padding:8px 6px;border-bottom:1px solid #e6dccf;vertical-align:top}tr{break-inside:avoid}
td.n{width:28px;font-weight:700;color:#6d28d9}td.d{white-space:nowrap}.s{font-size:12px;color:#6b6258}a{color:#0b5fa5}
.foot{margin-top:16px;font-size:12px;color:#6b6258}
</style></head><body>
<h1>🪔 ${esc(title)}</h1>
<p class="meta">${date} · ${stops.length} ${L.stops} · ${fmtDist(total)} ${L.walk}</p>
<table><thead><tr><th>${L.n}</th><th>${L.name}</th><th>${L.area}</th><th>${L.dist}</th><th>${L.map}</th></tr></thead><tbody>${rows}</tbody></table>
<p class="foot">${L.note}<br>${L.made}</p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
