"use client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { StationMark } from "@/lib/geo";
import type { Pandal, Place, Point } from "@/lib/types";

type Props = {
  pandals: Pandal[]; places: Place[]; seen: string[];
  you: Point | null; heading: number;           // my position and the way I'm facing (degrees, 0 = north)
  line: Point[]; lineColor: string; solid: boolean; showPlaces: boolean;
  onPick: (id: string) => void;
  target?: string | null;                       // the pandal I'm heading to (gold)
  trail?: string[];                             // unseen trail stops in visiting order (purple, numbered)
  dim?: boolean;                                // while navigating, fade everything else
  fitKey?: string | null;                       // zoom to the route once when this changes
  friends?: Friend[];                           // group members sharing their live location (avatar pins)
  focus?: { pts: Point[]; k: number } | null;   // fly to these points whenever k changes
  marks?: StationMark[];                        // metro stations to get in / out (green / red pins)
  rides?: Point[][];                            // the metro ride itself, drawn as an orange dashed line
  enterText?: string; exitText?: string;        // pin labels, so the page can translate them
};
const NO_MARKS: StationMark[] = [], NO_RIDES: Point[][] = [];
export type Friend = { id: string; nick: string; photo: string; lat: number; lng: number; stale: boolean; me?: boolean };

// Free OSM raster tiles are fine for a prototype. For launch, self-host
// Protomaps (PMTiles) so tiles are cached offline and you don't depend on OSM's usage policy.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tileSize: 256, attribution: "© OpenStreetMap contributors",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"] } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const ARROW = `<svg width="34" height="34" viewBox="0 0 36 36" aria-hidden><path d="M18 2 L31 33 L18 25.5 L5 33 Z" fill="#0077b6" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

export default function Map({ pandals, places, seen, you, heading, line, lineColor, solid, showPlaces, onPick, target, trail = [], dim, fitKey, friends = [], focus, marks = NO_MARKS, rides = NO_RIDES, enterText = "Enter metro", exitText = "Exit metro" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const lastFit = useRef<string | null>(null);
  const pick = useRef(onPick); pick.current = onPick;
  const els = useRef<Record<string, HTMLButtonElement>>({});
  const placeMarkers = useRef<maplibregl.Marker[]>([]);
  const youMarker = useRef<maplibregl.Marker | null>(null);
  const stationMarkers = useRef<maplibregl.Marker[]>([]);
  const friendPins = useRef<Record<string, { mk: maplibregl.Marker; el: HTMLDivElement; sig: string }>>({});

  // Create the map once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [88.3600, 22.5400], zoom: 11 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      const empty: GeoJSON.Feature<GeoJSON.LineString> = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };
      m.addSource("line", { type: "geojson", data: empty });
      m.addLayer({ id: "line-casing", type: "line", source: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 9, "line-opacity": 0.85 } });
      m.addLayer({ id: "line", type: "line", source: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#c1121f", "line-width": 5 } });
      m.addSource("ride", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [] } } });
      m.addLayer({ id: "ride-casing", type: "line", source: "ride", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 9, "line-opacity": 0.9 } });
      m.addLayer({ id: "ride", type: "line", source: "ride", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#e07a00", "line-width": 5, "line-dasharray": [2, 1.5] } });
      ready.current = true; m.fire("pandal-ready");
    });
    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; els.current = {}; youMarker.current = null; placeMarkers.current = []; stationMarkers.current = []; friendPins.current = {}; };
  }, []);

  // One marker per pandal, created once (not on every GPS update).
  useEffect(() => {
    const m = map.current; if (!m) return;
    const made: maplibregl.Marker[] = [];
    pandals.forEach((p) => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", p.name); el.title = p.name;
      el.style.cssText = "border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px #0006;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif;color:#fff;transition:width .2s,height .2s,opacity .2s,background .2s";
      el.onclick = () => pick.current(p.id);
      els.current[p.id] = el;
      made.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    });
    return () => { made.forEach((x) => x.remove()); els.current = {}; };
  }, [pandals]);

  // Colours: red = not seen, green = seen, purple + number = trail stop, gold = where I'm going. Everything else fades while navigating.
  useEffect(() => {
    const order: Record<string, number> = {}; trail.forEach((id, i) => { order[id] = i; });
    pandals.forEach((p) => {
      const el = els.current[p.id]; if (!el) return;
      const isSeen = seen.includes(p.id), isT = p.id === target, ti = order[p.id];
      let color = "#c1121f", size = 20, z = 1, op = 1, txt = "", ring = "0 1px 4px #0006";
      if (isSeen) { color = "#2f9e5b"; size = 18; }
      if (ti !== undefined && !isSeen) { color = "#6d28d9"; size = 28; z = 6; txt = String(ti + 1); }
      if (isT) { color = "#f2a900"; size = 38; z = 10; ring = "0 0 0 6px rgba(242,169,0,.4), 0 2px 8px #000a"; }
      if (dim && !isT && ti === undefined) { op = 0.28; size = 12; z = 0; txt = ""; }
      el.style.width = el.style.height = size + "px";
      el.style.background = color; el.style.opacity = String(op); el.style.zIndex = String(z);
      el.style.boxShadow = ring; el.style.color = isT ? "#2a0a0e" : "#fff";
      el.textContent = txt;
    });
  }, [pandals, seen, trail, target, dim]);

  // Food and sight markers.
  useEffect(() => {
    const m = map.current; if (!m) return;
    placeMarkers.current.forEach((x) => x.remove()); placeMarkers.current = [];
    if (!showPlaces) return;
    places.forEach((p) => {
      const el = document.createElement("div"); el.title = p.name;
      el.style.cssText = `width:12px;height:12px;border-radius:${p.type === "sight" ? "2px" : "50%"};background:#6b6258;border:2px solid #fff;box-shadow:0 1px 4px #0006`;
      placeMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    });
  }, [places, showPlaces]);

  // My location: an arrow that points the way I'm facing.
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!you) { youMarker.current?.remove(); youMarker.current = null; return; }
    if (!youMarker.current) {
      const el = document.createElement("div"); el.className = "you-arrow"; el.title = "You are here"; el.innerHTML = ARROW;
      youMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([you.lng, you.lat]).addTo(m);
    }
    youMarker.current.setLngLat([you.lng, you.lat]).setRotation(heading || 0);
  }, [you?.lat, you?.lng, heading]); // eslint-disable-line

  // Friends: a round photo (or first letter) with their name underneath. Built with DOM calls, never innerHTML, because names come from other users.
  useEffect(() => {
    const m = map.current; if (!m) return;
    const pins = friendPins.current, keep = new Set(friends.map((f) => f.id));
    Object.keys(pins).forEach((id) => { if (!keep.has(id)) { pins[id].mk.remove(); delete pins[id]; } });
    friends.forEach((f) => {
      const sig = [f.nick, f.photo, f.stale, f.me].join("|");
      let pin = pins[f.id];
      if (!pin) {
        const el = document.createElement("div");
        pin = { el, sig: "", mk: new maplibregl.Marker({ element: el }).setLngLat([f.lng, f.lat]).addTo(m) };
        pins[f.id] = pin;
      }
      if (pin.sig !== sig) {
        pin.sig = sig; pin.el.replaceChildren();
        pin.el.className = "fpin" + (f.stale ? " stale" : "") + (f.me ? " me" : "");
        pin.el.style.zIndex = f.me ? "9" : "8";
        const face = document.createElement("div"); face.className = "fpin-face";
        if (f.photo.startsWith("https://")) {
          const img = document.createElement("img"); img.src = f.photo; img.alt = ""; img.referrerPolicy = "no-referrer"; img.width = 40; img.height = 40;
          img.onerror = () => { img.remove(); face.textContent = (f.nick[0] || "?").toUpperCase(); };
          face.appendChild(img);
        } else face.textContent = (f.nick[0] || "?").toUpperCase();
        const tag = document.createElement("span"); tag.className = "fpin-tag"; tag.textContent = f.nick;
        pin.el.append(face, tag);
      }
      pin.mk.setLngLat([f.lng, f.lat]);
    });
  }, [friends]);

  // Fly to someone (one point) or to everyone (several points) when asked.
  useEffect(() => {
    const m = map.current; if (!m || !focus || !focus.pts.length) return;
    if (focus.pts.length === 1) { m.flyTo({ center: [focus.pts[0].lng, focus.pts[0].lat], zoom: Math.max(m.getZoom(), 16), duration: 700 }); return; }
    const b = new maplibregl.LngLatBounds(); focus.pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 70, maxZoom: 17, duration: 700 });
  }, [focus?.k]); // eslint-disable-line

  // Metro: a green pin where to get in, a red pin where to get out, and the ride as an orange dashed line.
  useEffect(() => {
    const m = map.current; if (!m) return;
    stationMarkers.current.forEach((x) => x.remove()); stationMarkers.current = [];
    marks.forEach((s) => {
      const enter = s.kind === "enter";
      const el = document.createElement("div"); el.title = s.label; el.style.cssText = "position:relative;pointer-events:none;z-index:7";
      const dot = document.createElement("div"); dot.textContent = "🚇";
      dot.style.cssText = `width:30px;height:30px;border-radius:50%;background:${enter ? "#1b8a4b" : "#b4232f"};border:3px solid #fff;box-shadow:0 2px 6px #0007;display:flex;align-items:center;justify-content:center;font-size:15px`;
      const tag = document.createElement("span"); tag.textContent = `${enter ? enterText : exitText}: ${s.label}`;
      tag.style.cssText = "position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;padding:2px 8px;border-radius:999px;background:#fff;color:#1a1a1a;font:700 11px system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px #0006";
      el.append(dot, tag);
      stationMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m));
    });
    return () => { stationMarkers.current.forEach((x) => x.remove()); stationMarkers.current = []; };
  }, [marks, enterText, exitText]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => (m.getSource("ride") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: rides.map((r) => r.map((p) => [p.lng, p.lat])) } });
    if (ready.current) apply(); else m.once("pandal-ready" as never, apply);
  }, [rides]);

  // Route line.
  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => {
      (m.getSource("line") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map((p) => [p.lng, p.lat]) } });
      m.setPaintProperty("line", "line-color", lineColor);
      m.setPaintProperty("line", "line-dasharray", solid ? [1, 0] : [2, 1.5]);
    };
    if (ready.current) apply(); else m.once("pandal-ready" as never, apply);
    // Zoom to the route once per start, not on every GPS tick.
    if (!fitKey) { lastFit.current = null; return; }
    if (lastFit.current !== fitKey && line.length > 1) {
      lastFit.current = fitKey;
      const b = new maplibregl.LngLatBounds();
      line.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 50, maxZoom: 17, duration: 600 });
    }
  }, [line, lineColor, solid, fitKey]);

  return <div ref={box} style={{ width: "100%", height: "100%", minHeight: 360, borderRadius: 14 }} />;
}
