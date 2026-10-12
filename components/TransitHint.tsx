"use client";
import { fmtDist } from "@/lib/geo";
import { useLang } from "@/lib/lang";
import { METRO, RAIL, nearest } from "@/lib/transit";
import type { Point } from "@/lib/types";

/** Nearest metro and train station to a pandal, plus a link for bus and train timings (no free live bus data exists for Kolkata). */
export default function TransitHint({ p }: { p: Point }) {
  const { lang } = useLang();
  const m = nearest(p, METRO)[0], r = nearest(p, RAIL)[0];
  const link = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=transit`;
  return (
    <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      {m && <span className="muted small">🚇 {m.s.name} · {fmtDist(m.d)}</span>}
      {r && <span className="muted small">🚆 {r.s.name} · {fmtDist(r.d)}</span>}
      <a className="btn sm outline" href={link} target="_blank" rel="noopener noreferrer">🚌 {lang === "bn" ? "বাস / ট্রেন ↗" : "Bus / train ↗"}</a>
    </div>
  );
}
