"use client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAVIGABLE, PANDALS, ZONES } from "@/lib/data";
import { useLang } from "@/lib/lang";
import { tx } from "@/lib/i18n";
import { useSaved, useSeen } from "@/lib/store";
import type { Pandal } from "@/lib/types";

// Raster tiles only. Pins are plain HTML markers, the same way the Hop map has always drawn them.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tileSize: 256, attribution: "© OpenStreetMap contributors", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"] } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const RED = "#c1121f", GREEN = "#2f9e5b", PURPLE = "#6d28d9";

/** Dark theme: invert the tiles only (not the pins), so pin colours stay true. */
function paintTheme(m: maplibregl.Map) {
  if (!m.getLayer("osm")) return;
  const dark = document.documentElement.dataset.theme === "dark";
  m.setPaintProperty("osm", "raster-brightness-min", dark ? 0.88 : 0);
  m.setPaintProperty("osm", "raster-brightness-max", dark ? 0.08 : 1);
  m.setPaintProperty("osm", "raster-hue-rotate", dark ? 180 : 0);
}

export default function AllPandalsMap() {
  const { lang } = useLang();
  const [seen, setSeen] = useSeen();
  const [saved, setSaved] = useSaved();
  const [zone, setZone] = useState("all");
  const [sel, setSel] = useState<Pandal | null>(null);
  const [note, setNote] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const els = useRef<Record<string, HTMLButtonElement>>({});
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const byIdLocal = useMemo(() => Object.fromEntries(NAVIGABLE.map((p) => [p.id, p])), []);
  const name = (p: Pandal) => (lang === "bn" && p.name_bn) || p.name;

  const shown = useMemo(() => NAVIGABLE.filter((p) => zone === "all" || p.zone === zone), [zone]);
  const unpinned = PANDALS.length - NAVIGABLE.length;

  // Build the map once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [88.36, 22.57], zoom: 10.5, cooperativeGestures: true });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      paintTheme(m);
      ready.current = true; m.fire("pandal-ready");
    });
    m.on("click", () => setSel(null));
    // Follow the day / night switch.
    const mo = new MutationObserver(() => paintTheme(m));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    map.current = m;
    return () => { mo.disconnect(); els.current = {}; m.remove(); map.current = null; ready.current = false; meMarker.current = null; };
  }, [byIdLocal]);

  // One marker per pandal in the chosen area (rebuilt only when the area changes).
  useEffect(() => {
    const m = map.current; if (!m) return;
    setSel(null);
    const made: maplibregl.Marker[] = [];
    els.current = {};
    shown.forEach((p) => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", p.name); el.title = p.name;
      el.style.cssText = "width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px #0006;padding:0;cursor:pointer";
      el.onclick = (ev) => { ev.stopPropagation(); setSel(p); m.easeTo({ center: [p.lng, p.lat], offset: [0, -60], duration: 400 }); };
      els.current[p.id] = el;
      made.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    });
    return () => { made.forEach((x) => x.remove()); els.current = {}; };
  }, [shown]);

  // Colours: red = not seen, green = seen, purple = in my trail.
  useEffect(() => {
    shown.forEach((p) => {
      const el = els.current[p.id]; if (!el) return;
      const isSeen = seen.includes(p.id), inTrail = saved.includes(p.id);
      el.style.background = isSeen ? GREEN : inTrail ? PURPLE : RED;
      el.style.zIndex = inTrail && !isSeen ? "3" : "1";
    });
  }, [shown, seen, saved]);

  // Zoom to the chosen area.
  useEffect(() => {
    const m = map.current; if (!m || !shown.length) return;
    setSel(null);
    if (zone === "all") { m.jumpTo({ center: [88.36, 22.57], zoom: m.getContainer().clientWidth < 600 ? 10.2 : 10.8 }); return; } // a few far suburbs would zoom the whole map out
    const b = new maplibregl.LngLatBounds();
    shown.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 40, maxZoom: 15, duration: 700 });
  }, [zone]); // eslint-disable-line

  function locate() {
    setNote("…");
    if (!navigator.geolocation) return setNote(tx(lang, "blocked"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const m = map.current; if (!m) return;
      const pt: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      if (!meMarker.current) {
        const el = document.createElement("div");
        el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#0077b6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(0,119,182,.3)";
        meMarker.current = new maplibregl.Marker({ element: el }).setLngLat(pt).addTo(m);
      } else meMarker.current.setLngLat(pt);
      m.flyTo({ center: pt, zoom: 14.5, duration: 800 }); setNote("");
    }, () => setNote(tx(lang, "blocked")), { timeout: 8000 });
  }

  const zoneKeys = Object.keys(ZONES);
  const isSeen = sel ? seen.includes(sel.id) : false, isSaved = sel ? saved.includes(sel.id) : false;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div id="all-pandals">
      <div className="chips" role="group" aria-label={lang === "bn" ? "এলাকা অনুযায়ী ফিল্টার" : "Filter map by area"}>
        {["all", ...zoneKeys].map((k) => (
          <button key={k} className="chip" aria-pressed={zone === k} onClick={() => setZone(k)}>{k === "all" ? tx(lang, "all") : ZONES[k][lang]}</button>
        ))}
      </div>
      <div className="allmap">
        <div ref={box} style={{ position: "absolute", inset: 0 }} />
        <button className="btn sm outline allmap-loc" onClick={locate}>📍 {lang === "bn" ? "আমার কাছে" : "Near me"}</button>
        {sel && (
          <div className="allmap-card" role="dialog" aria-label={name(sel)}>
            <button className="allmap-x" aria-label="Close" onClick={() => setSel(null)}>✕</button>
            <p className="zonetag" style={{ margin: 0 }}>{ZONES[sel.zone]?.[lang] ?? sel.zone}{sel.area ? ` · ${sel.area}` : ""}</p>
            <h3 style={{ fontSize: 19, margin: "2px 28px 8px 0" }}>{name(sel)}</h3>
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn sm primary" href={`/hop?from=${sel.id}`}>{tx(lang, "hopFrom")}</Link>
              <button className={`btn sm ${isSaved ? "gold" : "outline"}`} onClick={() => setSaved(toggle(saved, sel.id))}>{isSaved ? "★ " + tx(lang, "inTrail") : "☆ " + tx(lang, "addRoute")}</button>
              <button className={`btn sm ${isSeen ? "gold" : "outline"}`} onClick={() => setSeen(toggle(seen, sel.id))}>{isSeen ? "✓ " + tx(lang, "seen") : "✓ " + tx(lang, "markSeen")}</button>
            </div>
          </div>
        )}
      </div>
      <div className="legend" aria-label="Map colours">
        <span><i style={{ background: RED }} />{tx(lang, "notSeen")}</span>
        <span><i style={{ background: GREEN }} />{tx(lang, "seen")}</span>
        <span><i style={{ background: PURPLE }} />{lang === "bn" ? "আমার ট্রেইলে" : "In my trail"}</span>
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        {shown.length} {lang === "bn" ? "টি প্যান্ডেল মানচিত্রে। পিনে ট্যাপ করে বিস্তারিত দেখুন।" : "pandals on the map. Tap a pin for details."}
        {unpinned > 0 && zone === "all" ? (lang === "bn" ? ` আরও ${unpinned}টির সঠিক অবস্থান এখনও নিশ্চিত নয়, সেগুলি তালিকায় আছে।` : ` ${unpinned} more don't have a confirmed spot yet and are only in the list.`) : ""}
      </p>
      {note && <p className="msg">{note}</p>}
    </div>
  );
}
