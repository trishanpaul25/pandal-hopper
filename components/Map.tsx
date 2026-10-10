"use client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Pandal, Place, Point } from "@/lib/types";

type Props = {
  pandals: Pandal[]; places: Place[]; seen: string[];
  cur: (Point & { id?: string }) | null; line: Point[]; showPlaces: boolean;
  onPick: (id: string) => void;
};

// Free OSM raster tiles are fine for a prototype. For launch, self-host
// Protomaps (PMTiles) so tiles are cached offline and you don't depend on OSM's usage policy.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tileSize: 256, attribution: "© OpenStreetMap contributors",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"] } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function Map({ pandals, places, seen, cur, line, showPlaces, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const ready = useRef(false);

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [88.3600, 22.5400], zoom: 11 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("line", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
      m.addLayer({ id: "line", type: "line", source: "line", paint: { "line-color": "#c1121f", "line-width": 4, "line-dasharray": [2, 1.5] } });
      ready.current = true; m.fire("pandal-ready");
    });
    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.forEach((x) => x.remove()); markers.current = [];
    const dot = (color: string, size: number, label: string, shape = "50%") => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", label); el.title = label;
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:${shape};background:${color};border:2px solid #fff;box-shadow:0 1px 4px #0006;padding:0;cursor:pointer`;
      return el;
    };
    pandals.forEach((p) => {
      const el = dot(seen.includes(p.id) ? "#e8930c" : "#c1121f", 20, p.name);
      el.onclick = () => onPick(p.id);
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    });
    if (showPlaces) places.forEach((p) => {
      const el = dot("#6b6258", 12, p.name, p.type === "sight" ? "2px" : "50%");
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    });
    if (cur) {
      const el = document.createElement("div"); el.className = "you"; el.title = "You are here";
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([cur.lng, cur.lat]).addTo(m));
    }
  }, [pandals, places, seen, cur, showPlaces, onPick]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => (m.getSource("line") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map((p) => [p.lng, p.lat]) } });
    if (ready.current) apply(); else m.once("pandal-ready" as never, apply);
  }, [line]);

  return <div ref={box} style={{ width: "100%", height: "100%", minHeight: 360, borderRadius: 14 }} />;
}
