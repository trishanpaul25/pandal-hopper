"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PANDALS, ZONES } from "@/lib/data";
import { fmtDist, km } from "@/lib/geo";
import { tx } from "@/lib/i18n";
import { useLang } from "@/lib/lang";
import { toggleIn, useSaved, useSeen } from "@/lib/store";
import type { Point } from "@/lib/types";
import PandalCard from "./PandalCard";

// Built once: lower-cased search text and the A-Z order.
const INDEX = PANDALS.map((p) => ({ p, s: `${p.name} ${p.name_bn ?? ""} ${p.area ?? ""}`.toLowerCase() })).sort((a, b) => a.p.name.localeCompare(b.p.name));
const PAGE = 30;

export default function Directory() {
  const { lang } = useLang();
  const [seen, setSeen] = useSeen();
  const [saved, setSaved] = useSaved();
  const [q, setQ] = useState(""); const [zone, setZone] = useState("all"); const [unseenOnly, setUnseenOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE); const dq = useDeferredValue(q);
  const [sort, setSort] = useState<"name" | "near">("name"); const [me, setMe] = useState<Point | null>(null); const [note, setNote] = useState("");
  useEffect(() => { const z = new URLSearchParams(window.location.search).get("zone"); if (z && ZONES[z]) setZone(z); }, []);

  function nearMe() {
    navigator.geolocation?.getCurrentPosition((pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSort("near"); setNote(""); },
      () => { setNote(tx(lang, "blocked")); setSort("name"); }, { timeout: 8000 });
  }
  const list = useMemo(() => {
    const t = dq.trim().toLowerCase();
    const l = INDEX.filter((x) => (zone === "all" || x.p.zone === zone) && (!unseenOnly || !seen.includes(x.p.id)) && (!t || x.s.includes(t))).map((x) => x.p);
    return sort === "near" && me ? l.sort((a, b) => km(me, a) - km(me, b)) : l;
  }, [dq, zone, unseenOnly, seen, sort, me]);
  useEffect(() => { setLimit(PAGE); }, [dq, zone, unseenOnly, sort]);

  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "প্যান্ডেল ডিরেক্টরি" : "Pandal directory"}</span>
      <h1 className="h1">{PANDALS.length} {lang === "bn" ? "টি প্যান্ডেল" : "Pandals"}</h1>
      <div className="stats">
        <div className="stat"><b>{PANDALS.length}</b><span>{lang === "bn" ? "মোট তালিকাভুক্ত" : "Listed"}</span></div>
        <div className="stat"><b>{seen.length} / {PANDALS.length}</b><span>{lang === "bn" ? "দেখা হয়েছে" : "Seen by you"}</span></div>
        <div className="stat"><b>{saved.length}</b><span>{lang === "bn" ? "আমার ট্রেইলে" : "In my trail"}</span></div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <input className="search" style={{ flex: 1, minWidth: 220 }} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder={tx(lang, "search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tx(lang, "search")} />
        <button className="btn outline" onClick={nearMe}>📍 {lang === "bn" ? "কাছের আগে" : "Nearest first"}</button>
      </div>
      {note && <p className="msg">{note}</p>}
      <div className="chips">
        {["all", ...Object.keys(ZONES)].map((k) => <button key={k} className="chip" aria-pressed={zone === k} onClick={() => setZone(k)}>{k === "all" ? tx(lang, "all") : ZONES[k][lang]}</button>)}
        <button className="chip" aria-pressed={unseenOnly} onClick={() => setUnseenOnly(!unseenOnly)}>● {tx(lang, "unseenOnly")}</button>
      </div>
      <p className="muted small">{list.length} {lang === "bn" ? "টি দেখানো হচ্ছে" : "shown"} · {sort === "near" && me ? (lang === "bn" ? "কাছের ক্রমে" : "sorted by distance") : "A–Z"}</p>
      {list.length === 0 ? <div className="empty">No pandals match. Try another area or clear the search.</div> :
        <div className="pgrid" style={{ marginTop: 12 }}>
          {list.slice(0, limit).map((p) => (
            <PandalCard key={p.id} p={p} hopLink seen={seen.includes(p.id)} saved={saved.includes(p.id)}
              dist={sort === "near" && me ? fmtDist(km(me, p)) + " away" : undefined}
              onSeen={() => setSeen(toggleIn(seen, p.id))} onSave={() => setSaved(toggleIn(saved, p.id))} />
          ))}
        </div>}
      {list.length > limit && <div style={{ textAlign: "center", marginTop: 16 }}><button className="btn outline big" onClick={() => setLimit(limit + PAGE)}>{tx(lang, "more")} ({list.length - limit})</button></div>}
    </div>
  );
}
