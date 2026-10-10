"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PANDALS, PLACES, ROUTES, byId } from "@/lib/data";
import type { Pandal, Point } from "@/lib/types";
import { fmtDist, km, meters, pathLen, plan, walkMins, walkRoute, type WalkRoute } from "@/lib/geo";
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
  const [me, setMe] = useState<(Point & { acc: number }) | null>(null); // live GPS position
  const [tracking, setTracking] = useState(false);
  const [target, setTarget] = useState<Pandal | null>(null);              // pandal I'm walking to
  const [nav, setNav] = useState<(WalkRoute & { tid: string }) | null>(null);
  const [notice, setNotice] = useState("");
  const lastFetch = useRef<{ tid: string; o: Point } | null>(null);
  const reqId = useRef(0);
  const name = (p: Pandal) => (lang === "bn" && p.name_bn) || p.name;

  const here = useCallback((id: string) => {
    const p = byId[id]; setCur({ lat: p.lat, lng: p.lng, id, label: (lang === "bn" && p.name_bn) || p.name }); setPlanned(null); setMsg("");
  }, [lang]);
  useEffect(() => { const f = new URLSearchParams(window.location.search).get("from"); if (f && byId[f]) here(f); }, []); // eslint-disable-line

  const unseen = PANDALS.filter((p) => !seen.includes(p.id) && p.id !== cur?.id);
  const nearest = useMemo(() => (cur ? unseen.map((p) => ({ p, d: km(cur, p) })).sort((a, b) => a.d - b.d) : []), [cur, seen]); // eslint-disable-line
  const food = cur ? PLACES.filter((f) => f.type === "food").map((f) => ({ f, d: km(cur, f) })).sort((a, b) => a.d - b.d).slice(0, 3) : [];
  const trailPandals = saved.map((i) => byId[i]).filter(Boolean) as Pandal[];
  const visited = seen.map((i) => byId[i]).filter(Boolean) as Pandal[];
  const origin: Point | null = me ?? cur;
  const line: Point[] = target && nav?.tid === target.id ? nav.coords
    : planned && cur ? [cur, ...planned]
    : route === "trail" ? trailPandals
    : route ? (ROUTES.find((r) => r.id === route)?.ids.map((i) => byId[i]) ?? []) : [];

  // GO: show the walking route to this pandal and start following my position. Does NOT mark it seen.
  const go = (p: Pandal) => {
    if (target?.id === p.id) { stopGo(); return; }
    lastFetch.current = null; setNav(null); setNotice(""); setTarget(p); setTracking(true);
  };
  const stopGo = () => { setTarget(null); setNav(null); lastFetch.current = null; };
  const markSeen = (id: string) => { if (!seen.includes(id)) setSeen([...seen, id]); };
  const unmarkSeen = (id: string) => setSeen(seen.filter((x) => x !== id));
  // Manual "I'm here" (also what the auto-arrival does).
  const arrive = (p: Pandal, auto = false) => {
    markSeen(p.id); stopGo(); here(p.id);
    setNotice(`${auto ? "📍 " : "✓ "}${name(p)} ${lang === "bn" ? "দেখা হয়েছে" : "marked as seen"}`);
    if (auto) try { navigator.vibrate?.(200); } catch {}
  };

  // Keep following my position while hopping.
  useEffect(() => {
    if (!tracking || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((pos) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      setMe(pt);
      setCur((c) => (c && c.id ? c : { lat: pt.lat, lng: pt.lng, label: "" })); // GPS start follows me; a picked pandal stays put
    }, () => { setMsg(tx(lang, "blocked")); setTracking(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]); // eslint-disable-line

  // Fetch the walking route to the target (re-fetch only if I've moved ~40 m).
  useEffect(() => {
    if (!target || !origin) return;
    const last = lastFetch.current;
    if (last && last.tid === target.id && meters(last.o, origin) < 40) return;
    lastFetch.current = { tid: target.id, o: { lat: origin.lat, lng: origin.lng } };
    const id = ++reqId.current;
    walkRoute(origin, target).then((r) => { if (id === reqId.current) setNav({ ...r, tid: target.id }); });
  }, [target, origin?.lat, origin?.lng]); // eslint-disable-line

  // Auto mark seen when I reach the target.
  useEffect(() => {
    if (target && me && me.acc <= 100 && meters(me, target) <= 50) arrive(target, true);
  }, [me, target]); // eslint-disable-line

  function gps() {
    setMsg("…");
    if (!navigator.geolocation) return setMsg(tx(lang, "blocked"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (Math.min(...PANDALS.map((p) => km(me, p))) > 40) return setMsg(tx(lang, "far"));
      setCur({ ...me, label: "" }); setMe({ ...me, acc: pos.coords.accuracy }); setTracking(true); setPlanned(null); setMsg("");
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
        <Map pandals={PANDALS} places={PLACES} seen={seen} cur={me ?? cur} line={line} showPlaces={!!cur} onPick={here} target={target?.id ?? null} trail={saved} fitKey={target?.id ?? null} />
      </div>

      {notice && <div className="card paar" style={{ marginTop: 12, borderLeftColor: "var(--shiuli)" }}><b>{notice}</b></div>}
      {target && (() => {
        const straight = origin ? meters(origin, target) : null;
        return <div className="card paar" style={{ marginTop: 12 }}>
          <p className="zonetag" style={{ margin: 0 }}>➤ {tx(lang, "heading")}</p>
          <h3 style={{ fontSize: 22 }}>{name(target)}</h3>
          <p className="muted small" style={{ margin: "2px 0 0" }}>
            {!origin ? tx(lang, "locating")
              : nav?.tid === target.id ? `${fmtDist(nav.km)} · ~${nav.mins} min${nav.approx ? (lang === "bn" ? " (সরলরেখা, অফলাইন)" : " (straight line, offline)") : ""}${straight !== null ? ` · ${straight < 1000 ? Math.round(straight) + " m" : (straight / 1000).toFixed(1) + " km"} ${tx(lang, "away")}` : ""}`
              : "…"}
          </p>
          <p className="muted small" style={{ margin: "4px 0 0" }}>{lang === "bn" ? "৫০ মিটারের মধ্যে পৌঁছলে নিজে থেকেই দেখা চিহ্নিত হবে।" : "It will be marked as seen automatically when you're within 50 m."}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => arrive(target)}>✓ {tx(lang, "imHere")}</button>
            <button className="btn outline" onClick={stopGo}>{tx(lang, "stop")}</button>
          </div>
        </div>;
      })()}

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
          <h2 className="h2">{tx(lang, "nearest")} {cur.id ? cur.label : tx(lang, "gps")}</h2>
          <div className="pgrid" style={{ marginTop: 14 }}>
            {nearest.slice(0, 3).map((x, i) => (
              <PandalCard key={x.p.id} p={x.p} rank={i + 1} dist={`${fmtDist(x.d)} · ~${walkMins(x.d)} min`}
                seen={false} saved={saved.includes(x.p.id)} onSave={() => setSaved(toggleIn(saved, x.p.id))}
                onGo={() => go(x.p)} going={target?.id === x.p.id} onSeen={() => arrive(x.p)}>
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
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h2">★ {tx(lang, "myTrail")} ({trailPandals.length})</h2>
          <div className="row">
            {trailPandals.length > 0 && <button className={`btn sm ${route === "trail" ? "primary" : "outline"}`} onClick={() => { setPlanned(null); setRoute(route === "trail" ? null : "trail"); }}>{route === "trail" ? tx(lang, "showing") : tx(lang, "showTrail")}</button>}
            <Link className="btn sm outline" href="/saved">{tx(lang, "openTrail")} →</Link>
          </div>
        </div>
        {trailPandals.length === 0 ? <div className="empty" style={{ marginTop: 12 }}>{tx(lang, "trailEmpty")}</div> : (
          <div className="card" style={{ marginTop: 12 }}>
            {trailPandals.map((p, i) => (
              <div className="item" key={p.id}>
                <div><h3>{i + 1}. {name(p)}{seen.includes(p.id) && <span className="tag">✓ {tx(lang, "seen")}</span>}</h3>{cur && <p>{fmtDist(km(cur, p))} · ~{walkMins(km(cur, p))} min</p>}</div>
                <div className="row">
                  <button className={`btn sm ${target?.id === p.id ? "gold" : "primary"}`} onClick={() => go(p)}>➤ {target?.id === p.id ? tx(lang, "stop") : tx(lang, "go")}</button>
                  <button className="btn sm" aria-label="Remove from my trail" onClick={() => setSaved(saved.filter((x) => x !== p.id))}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sec">
        <h2 className="h2">✓ {tx(lang, "visited")} ({visited.length})</h2>
        {visited.length === 0 ? <div className="empty" style={{ marginTop: 12 }}>{tx(lang, "visitedEmpty")}</div> : (
          <div className="card" style={{ marginTop: 12 }}>
            {visited.map((p) => (
              <div className="item" key={p.id}>
                <div><h3>{name(p)}</h3>{p.area && <p>{p.area}</p>}</div>
                <button className="btn sm outline" onClick={() => unmarkSeen(p.id)}>✕ {tx(lang, "unmark")}</button>
              </div>
            ))}
          </div>
        )}
      </section>

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
