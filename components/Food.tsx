"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PLACES, byId } from "@/lib/data";
import { mapsLink } from "@/lib/exportPlan";
import { fmtDist, km } from "@/lib/geo";
import { listMins } from "@/lib/transit";
import { tx } from "@/lib/i18n";
import { useLang } from "@/lib/lang";
import { useMode } from "@/lib/mode";
import { toggleIn, useSavedPlaces } from "@/lib/store";
import type { Place, Point } from "@/lib/types";
import ModeBar from "./ModeBar";
import PandalPicker from "./PandalPicker";

const KIND = {
  all: { en: "All", bn: "সব" }, restaurant: { en: "Restaurants", bn: "রেস্তোরাঁ" }, cafe: { en: "Cafés", bn: "ক্যাফে" },
  fastfood: { en: "Snacks & rolls", bn: "স্ন্যাকস ও রোল" }, sweets: { en: "Sweets & bakery", bn: "মিষ্টি ও বেকারি" }, sight: { en: "Sights", bn: "দর্শনীয়" },
} as const;
type KindKey = keyof typeof KIND;
const kindOf = (f: Place): KindKey => (f.type === "sight" ? "sight" : f.kind && f.kind in KIND && f.kind !== ("all" as string) ? (f.kind as KindKey) : "restaurant");

// Built once: lower-cased search text, A-Z order, and how many places each chip holds.
const INDEX = PLACES.map((f) => ({ f, k: kindOf(f), s: `${f.name} ${f.name_bn ?? ""} ${f.note}`.toLowerCase() })).sort((a, b) => a.f.name.localeCompare(b.f.name));
const COUNT: Record<string, number> = { all: INDEX.length };
INDEX.forEach((x) => { COUNT[x.k] = (COUNT[x.k] ?? 0) + 1; });
const PAGE = 30;

export default function Food() {
  const { lang } = useLang();
  const { mode } = useMode();
  const [sp, setSp] = useSavedPlaces();
  const [kind, setKind] = useState<KindKey>("all");
  const [q, setQ] = useState(""); const dq = useDeferredValue(q);
  const [base, setBase] = useState<(Point & { label: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const pickPandal = (id: string) => { const p = byId[id]; setBase({ lat: p.lat, lng: p.lng, label: (lang === "bn" && p.name_bn) || p.name }); setMsg(""); };
  const locate = () => {
    setMsg("…");
    if (!navigator.geolocation) return setMsg(tx(lang, "blocked"));
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBase({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: tx(lang, "gps") }); setMsg(""); },
      () => setMsg(tx(lang, "blocked")), { timeout: 8000 });
  };

  const list = useMemo(() => {
    const t = dq.trim().toLowerCase();
    const l = INDEX.filter((x) => (kind === "all" || x.k === kind) && (!t || x.s.includes(t))).map((x) => ({ f: x.f, k: x.k, d: base ? km(base, x.f) : 0 }));
    return base ? l.sort((a, b) => a.d - b.d) : l;
  }, [dq, kind, base]);
  useEffect(() => { setLimit(PAGE); }, [dq, kind, base]);

  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "খাওয়া-দাওয়া ও দর্শনীয়" : "Food trail & sights"}</span>
      <h1 className="h1">{lang === "bn" ? "কাছেই কী আছে" : "What's near me"}</h1>

      <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
        <input className="search" style={{ flex: 1, minWidth: 220 }} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
          placeholder={tx(lang, "searchFood")} aria-label={tx(lang, "searchFood")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <PandalPicker onPick={pickPandal} />
        <button className="btn outline" onClick={locate}>📍 {tx(lang, "gps")}</button>
      </div>
      <ModeBar />
      {msg && <p className="msg">{msg}</p>}
      {base && <p className="muted small" style={{ margin: "8px 0 0" }}>📍 {tx(lang, "sortedFrom")} <b>{base.label}</b> · <button className="btn sm" onClick={() => setBase(null)}>✕</button></p>}

      <div className="chips">
        {(Object.keys(KIND) as KindKey[]).map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND[k][lang]} ({COUNT[k] ?? 0})</button>)}
      </div>
      {!base && <p className="muted small">{tx(lang, "pickToSort")}</p>}
      <p className="muted small" style={{ margin: "4px 0 0" }}>{list.length} {lang === "bn" ? "টি ফলাফল" : list.length === 1 ? "place" : "places"}</p>

      {list.length === 0 && <div className="empty" style={{ marginTop: 12 }}>{tx(lang, "noMatch")}</div>}
      <div className="pgrid" style={{ marginTop: 10 }}>
        {list.slice(0, limit).map(({ f, k, d }) => (
          <div className="card paar" key={f.id}>
            <p className="zonetag" style={{ margin: 0 }}>{KIND[k][lang]}</p>
            <h3 style={{ fontSize: 21 }}>{(lang === "bn" && f.name_bn) || f.name}</h3>
            <p className="muted" style={{ margin: "2px 0 10px" }}>{f.note}</p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="small">{base ? `${fmtDist(d)} · ${listMins(mode, d, base, f)} min` : ""}</b>
              <div className="row">
                <a className="btn sm outline" href={mapsLink(f)} target="_blank" rel="noopener noreferrer">↗ {tx(lang, "directions")}</a>
                <button className={`btn sm ${sp.includes(f.id) ? "gold" : "outline"}`} aria-pressed={sp.includes(f.id)} onClick={() => setSp(toggleIn(sp, f.id))}>{sp.includes(f.id) ? "★ Saved" : "☆ Save"}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {list.length > limit && <div style={{ textAlign: "center", marginTop: 16 }}><button className="btn outline big" onClick={() => setLimit(limit + PAGE)}>{tx(lang, "more")} ({list.length - limit})</button></div>}
      <p className="muted small" style={{ marginTop: 14 }}>{lang === "bn" ? "খাবারের তথ্য © OpenStreetMap contributors ও কিছু বাছাই করা এন্ট্রি। যাওয়ার আগে খোলা আছে কিনা দেখে নিন।" : "Food data © OpenStreetMap contributors plus a few hand-picked entries. Confirm a place is open before you go."}</p>
    </div>
  );
}
