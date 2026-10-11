"use client";
import { useState } from "react";
import { NAVIGABLE, PLACES, byId } from "@/lib/data";
import { fmtDist, km, walkMins } from "@/lib/geo";
import { tx } from "@/lib/i18n";
import { useLang } from "@/lib/lang";
import { toggleIn, useSavedPlaces } from "@/lib/store";

export default function Food() {
  const { lang } = useLang();
  const [sp, setSp] = useSavedPlaces();
  const [filter, setFilter] = useState<"all" | "food" | "sight">("all");
  const [at, setAt] = useState("");
  const base = at ? byId[at] : null;
  const list = PLACES.filter((f) => filter === "all" || f.type === filter)
    .map((f) => ({ f, d: base ? km(base, f) : 0 })).sort((a, b) => (base ? a.d - b.d : a.f.name.localeCompare(b.f.name)));
  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "খাওয়া-দাওয়া ও দর্শনীয়" : "Food trail & sights"}</span>
      <h1 className="h1">{lang === "bn" ? "কাছেই কী আছে" : "What's near me"}</h1>
      <div className="row" style={{ marginTop: 14 }}>
        <select className="search" style={{ flex: 1, minWidth: 220 }} value={at} onChange={(e) => setAt(e.target.value)} aria-label={tx(lang, "where")}>
          <option value="">{tx(lang, "where")}</option>
          {[...NAVIGABLE].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{(lang === "bn" && p.name_bn) || p.name}</option>)}
        </select>
      </div>
      <div className="chips">
        {(["all", "food", "sight"] as const).map((k) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === "all" ? tx(lang, "all") : k === "food" ? tx(lang, "foodT") : tx(lang, "sightT")}</button>)}
      </div>
      {!base && <p className="muted small">Pick where you are to sort by distance. Showing A–Z.</p>}
      <div className="pgrid" style={{ marginTop: 10 }}>
        {list.map(({ f, d }) => (
          <div className="card paar" key={f.id}>
            <p className="zonetag" style={{ margin: 0 }}>{f.type === "food" ? tx(lang, "foodT") : tx(lang, "sightT")}</p>
            <h3 style={{ fontSize: 21 }}>{f.name}</h3>
            <p className="muted" style={{ margin: "2px 0 10px" }}>{f.note}</p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="small">{base ? `${fmtDist(d)} · ${walkMins(d)} min` : ""}</b>
              <button className={`btn sm ${sp.includes(f.id) ? "gold" : "outline"}`} aria-pressed={sp.includes(f.id)} onClick={() => setSp(toggleIn(sp, f.id))}>{sp.includes(f.id) ? "★ Saved" : "☆ Save"}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>Sample entries. Confirm a place is open before you go.</p>
    </div>
  );
}
