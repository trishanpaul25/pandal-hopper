"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PANDALS, PLACES, ROUTES, byId } from "@/lib/data";
import type { Pandal, Point } from "@/lib/types";
import { fmtDist, km, pathLen, plan, walkMins } from "@/lib/geo";
import { tx } from "@/lib/i18n";
import { useLang } from "@/lib/lang";
import { toggleIn, useSaved, useSeen } from "@/lib/store";
import Bi from "./Bi";
import PandalCard from "./PandalCard";

const Map = dynamic(() => import("./Map"), { ssr: false });
type Cur = Point & { id?: string; label: string };

export default function Hop() {
  const { lang } = useLang();
  const [seen, setSeen] = useSeen();
  const [saved, setSaved] = useSaved();
  const [cur, setCur] = useState<Cur | null>(null);
  const [planned, setPlanned] = useState<Pandal[] | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const name = (p: Pandal) => (lang === "bn" && p.name_bn) || p.name;

  const here = useCallback((id: string) => {
    const p = byId[id]; setCur({ lat: p.lat, lng: p.lng, id, label: (lang === "bn" && p.name_bn) || p.name }); setPlanned(null); setMsg("");
  }, [lang]);
  useEffect(() => { const f = new URLSearchParams(window.location.search).get("from"); if (f && byId[f]) here(f); }, []); // eslint-disable-line

  const unseen = PANDALS.filter((p) => !seen.includes(p.id) && p.id !== cur?.id);
  const nearest = useMemo(() => (cur ? unseen.map((p) => ({ p, d: km(cur, p) })).sort((a, b) => a.d - b.d) : []), [cur, seen]); // eslint-disable-line
  const food = cur ? PLACES.filter((f) => f.type === "food").map((f) => ({ f, d: km(cur, f) })).sort((a, b) => a.d - b.d).slice(0, 3) : [];
  const line: Point[] = planned && cur ? [cur, ...planned] : route ? (ROUTES.find((r) => r.id === route)?.ids.map((i) => byId[i]) ?? []) : [];
  const goSeen = (id: string) => { if (!seen.includes(id)) setSeen([...seen, id]); here(id); };

  function gps() {
    setMsg("…");
    if (!navigator.geolocation) return setMsg(tx(lang, "blocked"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (Math.min(...PANDALS.map((p) => km(me, p))) > 40) return setMsg(tx(lang, "far"));
      setCur({ ...me, label: tx(lang, "gps") }); setPlanned(null); setMsg("");
    }, () => setMsg(tx(lang, "blocked")), { timeout: 8000 });
  }
  const listLen = planned && cur ? pathLen(cur, unseen) : 0;
  const saving = planned && cur ? listLen - pathLen(cur, planned) : 0;

  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "সহজ পরিক্রমা" : "Live route companion"}</span>
      <h1 className="h1" style={{ fontSize: "clamp(26px,5vw,38px)", marginBottom: 14 }}>{lang === "bn" ? "আপনার হপ রুট" : "Your hop route"}</h1>
      {PANDALS.some((p) => !p.verified) && <p className="muted small">Some locations are unverified sample data.</p>}

      <div className="mapbox">
        <Map pandals={PANDALS} places={PLACES} seen={seen} cur={cur} line={line} showPlaces={!!cur} onPick={here} />
      </div>

      <div className="card sec" style={{ marginTop: 16 }}>
        <label className="muted small" htmlFor="start" style={{ fontWeight: 600 }}><Bi k="where" /></label>
        <div className="locrow" style={{ marginTop: 6 }}>
          <select id="start" className="search" value={cur?.id ?? ""} onChange={(e) => e.target.value && here(e.target.value)}>
            <option value="">{tx(lang, "where")}</option>
            {PANDALS.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
          </select>
          <button className="btn outline" onClick={gps}>📍 <Bi k="gps" caption={false} /></button>
        </div>
        {msg && <p className="msg">{msg}</p>}
        <div className="segbar" role="progressbar" aria-valuenow={seen.length} aria-valuemax={PANDALS.length} aria-label="Pandals seen">
          {PANDALS.map((p) => <i key={p.id} className={seen.includes(p.id) ? "on" : ""} />)}
        </div>
        <p className="muted small" style={{ margin: 0 }}>{seen.length} / {PANDALS.length} {lang === "bn" ? "টি দেখা হয়েছে" : "pandals seen"} · {PANDALS.length - seen.length} {lang === "bn" ? "বাকি" : "remaining"}</p>
      </div>

      <section className="sec">
        {!cur ? <div className="empty"><Bi k="empty" caption={false} /></div>
          : !nearest.length ? <div className="empty"><Bi k="doneAll" caption={false} /></div> : <>
          <h2 className="h2">{tx(lang, "nearest")} {cur.label}</h2>
          <div className="pgrid" style={{ marginTop: 14 }}>
            {nearest.slice(0, 3).map((x, i) => (
              <PandalCard key={x.p.id} p={x.p} rank={i + 1} dist={`${fmtDist(x.d)} · ~${walkMins(x.d)} min`}
                seen={false} saved={saved.includes(x.p.id)} goLabel onSeen={() => goSeen(x.p.id)}>
                <button className="btn outline" style={{ marginTop: 8 }} onClick={() => setSaved(toggleIn(saved, x.p.id))}>
                  {saved.includes(x.p.id) ? "★ " + tx(lang, "inTrail") : "☆ " + tx(lang, "addRoute")}
                </button>
              </PandalCard>
            ))}
          </div>
          <div className="cta" style={{ marginTop: 18 }}>
            <div>
              <h2>{lang === "bn" ? "বাকি সব প্যান্ডেল, একটি সাজানো ক্রমে" : "All remaining pandals, in one smart order"}</h2>
              <p>{planned ? (saving > 0.05 ? `${(saving).toFixed(1)} km shorter than visiting in list order.` : "This order keeps your walking short.") : "Re-orders what's left so you don't zig-zag across the city."}</p>
            </div>
            <div className="row">
              <button className="btn primary big" onClick={() => setPlanned(plan(cur, unseen))}><Bi k="plan" caption={false} /></button>
              {planned && <button className="btn big" onClick={() => setPlanned(null)}><Bi k="clear" caption={false} /></button>}
            </div>
          </div>
          {planned && <div className="card paar" style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 22 }}>{tx(lang, "order")}</h3>
            <p className="muted small">{planned.length} stops · {fmtDist(pathLen(cur, planned))}</p>
            {planned.map((p, i) => <div className="stop" key={p.id}><span>{i + 1}. {name(p)}</span></div>)}
          </div>}
        </>}
      </section>

      {cur && <section className="sec">
        <h2 className="h2"><Bi k="eatNear" caption={false} /></h2>
        <div className="card" style={{ marginTop: 12 }}>
          {food.map((x) => <div className="item" key={x.f.id}><div><h3>{x.f.name}</h3><p>{x.f.note}</p></div><b className="muted small">{fmtDist(x.d)} · {walkMins(x.d)} min</b></div>)}
          <Link className="btn outline" href="/food" style={{ marginTop: 10 }}>{tx(lang, "food")} →</Link>
        </div>
      </section>}

      <section className="sec">
        <h2 className="h2"><Bi k="routes" caption={false} /></h2>
        <div className="grid3" style={{ marginTop: 14 }}>
          {ROUTES.map((r) => (
            <div className="card paar" key={r.id}>
              <h3 style={{ fontSize: 21 }}>{r.name}</h3><p className="muted" style={{ margin: "4px 0 8px" }}>{r.blurb}</p>
              <p className="small"><b>{r.ids.length}</b> stops · about <b>{fmtDist(r.km)}</b> · {r.ids.filter((i) => seen.includes(i)).length} ✓</p>
              <button className={`btn sm ${route === r.id ? "primary" : "outline"}`} onClick={() => { setPlanned(null); setRoute(route === r.id ? null : r.id); }}>{route === r.id ? tx(lang, "showing") : tx(lang, "showMap")}</button>
              <div style={{ marginTop: 8 }}>
                {r.ids.map((id) => (
                  <label key={id} className={`stop ${seen.includes(id) ? "done" : ""}`}>
                    <input type="checkbox" checked={seen.includes(id)} onChange={() => setSeen(toggleIn(seen, id))} /><span>{name(byId[id])}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
