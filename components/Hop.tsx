"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NAVIGABLE as PANDALS, PLACES, ROUTES, byId } from "@/lib/data";
import type { Pandal, Point } from "@/lib/types";
import { bearing, bestOrder, fmtDist, km, meters, pathLen, plan, type Mode, type ViaRoute, type WalkRoute } from "@/lib/geo";
import { tx } from "@/lib/i18n";
import { listMins, routeFor, routeViaFor } from "@/lib/transit";
import { useLang } from "@/lib/lang";
import { modeInfo, useMode } from "@/lib/mode";
import { toggleIn, useSaved, useSeen } from "@/lib/store";
import Bi from "./Bi";
import ModeBar from "./ModeBar";
import TransitHint from "./TransitHint";
import PandalCard from "./PandalCard";
import PandalPicker from "./PandalPicker";
import { exportPdf, planText } from "@/lib/exportPlan";

const Map = dynamic(() => import("./Map"), { ssr: false });
type Cur = Point & { id?: string; label: string };

const startKey0 = (o: Point | null) => (o ? `${o.lat.toFixed(2)},${o.lng.toFixed(2)}` : "");

export default function Hop() {
  const { lang } = useLang();
  const { mode } = useMode();
  const [seen, setSeen] = useSeen();
  const [saved, setSaved] = useSaved();
  const [cur, setCur] = useState<Cur | null>(null);
  const [planned, setPlanned] = useState<Pandal[] | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [me, setMe] = useState<(Point & { acc: number; heading: number | null }) | null>(null); // live GPS position
  const [tracking, setTracking] = useState(false);
  const [target, setTarget] = useState<Pandal | null>(null);              // single pandal I'm walking to
  const [nav, setNav] = useState<(WalkRoute & { tid: string; mode: Mode }) | null>(null);
  const [locked, setLocked] = useState<string[] | null>(null);            // Trail Go: the visiting order, fixed at the start
  const [trailRt, setTrailRt] = useState<(ViaRoute & { key: string; mode: Mode }) | null>(null);
  const [stamp, setStamp] = useState("");                                 // changes on each Go, so the map zooms once
  const [notice, setNotice] = useState("");
  const [nearLimit, setNearLimit] = useState(6);
  const [planLimit, setPlanLimit] = useState(40);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const savedRef = useRef(saved); savedRef.current = saved;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetch = useRef<{ tid: string; o: Point; mode: Mode } | null>(null);
  const lastTrail = useRef<{ key: string; o: Point | null; mode: Mode } | null>(null);
  const reqId = useRef(0), trailReq = useRef(0);
  const prevMe = useRef<Point | null>(null), lastHead = useRef<number | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const autoTrail = useRef(false);
  const name = (p: Pandal) => (lang === "bn" && p.name_bn) || p.name;

  const here = useCallback((id: string) => {
    const p = byId[id]; setCur({ lat: p.lat, lng: p.lng, id, label: (lang === "bn" && p.name_bn) || p.name }); setPlanned(null); setMsg("");
  }, [lang]);
  useEffect(() => { const f = new URLSearchParams(window.location.search).get("from"); if (f && byId[f]) here(f); }, []); // eslint-disable-line

  const showToast = (text: string, undo?: () => void) => {
    setToast({ text, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  // Add to trail: show a pop-up, and the card disappears so the next pandal moves up.
  const addTrail = (p: Pandal) => {
    if (saved.includes(p.id)) return;
    setSaved([...saved, p.id]);
    showToast(`★ ${name(p)} ${lang === "bn" ? "ট্রেইলে যোগ হয়েছে" : "added to your trail"}`, () => setSaved(savedRef.current.filter((x) => x !== p.id)));
  };
  const removeTrail = (p: Pandal) => {
    setSaved(saved.filter((x) => x !== p.id));
    showToast(`✕ ${name(p)} ${lang === "bn" ? "ট্রেইল থেকে সরানো হয়েছে" : "removed from your trail"}`, () => setSaved([...savedRef.current.filter((x) => x !== p.id), p.id]));
  };
  const toggleTrail = (p: Pandal) => (saved.includes(p.id) ? removeTrail(p) : addTrail(p));
  const doExport = (title: string, stops: Pandal[]) => {
    if (!exportPdf({ title, stops, start: origin, bn: lang === "bn" })) showToast(lang === "bn" ? "পপ-আপ অনুমতি দিন, তারপর আবার চেষ্টা করুন" : "Allow pop-ups to export, then try again");
  };
  const shareTrail = async (stops: Pandal[]) => {
    const title = lang === "bn" ? "আমার পুজো ট্রেইল" : "My Pandal Trail";
    const text = planText(title, stops, lang === "bn");
    try {
      if (navigator.share) await navigator.share({ title, text });
      else { await navigator.clipboard.writeText(text); showToast(lang === "bn" ? "কপি হয়েছে, এবার পেস্ট করে পাঠান" : "Copied. Paste it into a chat to share."); }
    } catch { /* cancelled */ }
  };

  const unseen = PANDALS.filter((p) => !seen.includes(p.id) && p.id !== cur?.id);
  const nearest = useMemo(() => (cur ? unseen.filter((p) => !saved.includes(p.id)).map((p) => ({ p, d: km(cur, p) })).sort((a, b) => a.d - b.d) : []), [cur, seen, saved]); // eslint-disable-line
  // Thousands of food places exist now, so rank once per ~10 m of movement and only draw the close ones on the map.
  const curKey = cur ? `${cur.lat.toFixed(4)},${cur.lng.toFixed(4)}` : "";
  const ranked = useMemo(() => (cur ? PLACES.map((f) => ({ f, d: km(cur, f) })).sort((a, b) => a.d - b.d) : []), [curKey]); // eslint-disable-line
  const food = ranked.filter((x) => x.f.type === "food").slice(0, 5);
  const mapPlaces = useMemo(() => ranked.filter((x) => x.d <= 1.2).slice(0, 80).map((x) => x.f), [ranked]);
  const visited = seen.map((i) => byId[i]).filter(Boolean) as Pandal[];
  const origin: Point | null = me ?? cur;
  const seenN = PANDALS.filter((p) => seen.includes(p.id)).length;
  // Round down to the nearest hundred so it stays true as the list grows: 592 shows "500+", 640 shows "600+".
  const countLabel = PANDALS.length >= 100 ? `${Math.floor(PANDALS.length / 100) * 100}+` : String(PANDALS.length);          // seen pandals that have a real pin
  const [moreRoutes, setMoreRoutes] = useState(false);
  const routeList = useMemo(() => {                                          // closest routes first
    const l = [...ROUTES];
    if (origin) l.sort((a, b) => (a.start ? km(origin, a.start) : 99) - (b.start ? km(origin, b.start) : 99));
    return l;
  }, [startKey0(origin)]); // eslint-disable-line
  const routesShown = moreRoutes ? routeList.slice(0, 12) : routeList.slice(0, 3);

  // ---- Trail: unseen stops, in the best order, with a walking route through them ----
  const trailAll = saved.map((i) => byId[i]).filter((p) => p && p.precision !== "approx") as Pandal[];
  const trailStops = trailAll.filter((p) => !seen.includes(p.id));
  const trailSeen = trailAll.filter((p) => seen.includes(p.id));
  const trailKey = trailStops.map((p) => p.id).join(",");
  const startKey = origin ? `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}` : "";
  const previewOrder = useMemo(() => bestOrder(origin, trailStops), [trailKey, startKey]); // eslint-disable-line
  const trailOn = locked !== null;
  const trailOrder: Pandal[] = locked
    ? [...locked.filter((id) => trailStops.some((p) => p.id === id)).map((id) => byId[id]), ...trailStops.filter((p) => !locked.includes(p.id))]
    : previewOrder;
  const rtKey = trailOrder.map((p) => p.id).join(",") + (origin ? "@o" : "");
  const rtOk = !!trailRt && trailRt.key === rtKey && trailRt.mode === mode;
  const rtHasOrigin = rtKey.endsWith("@o");
  const legFor = (i: number): number | null => { if (!rtOk) return null; const j = rtHasOrigin ? i : i - 1; return j >= 0 ? trailRt!.legs[j] ?? null : null; };

  const goStamp = () => String(Date.now());
  const showMap = () => requestAnimationFrame(() => mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const markSeen = (id: string) => { if (!seen.includes(id)) setSeen([...seen, id]); };
  const unmarkSeen = (id: string) => setSeen(seen.filter((x) => x !== id));
  const stopGo = () => { setTarget(null); setNav(null); lastFetch.current = null; };
  const stopTrail = () => setLocked(null);

  // GO (single pandal): show the walking route and follow my position. Does NOT mark it seen.
  const go = (p: Pandal) => {
    if (target?.id === p.id) { stopGo(); return; }
    stopTrail(); lastFetch.current = null; setNav(null); setNotice(""); setTarget(p); setTracking(true); setStamp(goStamp()); showMap();
  };
  // TRAIL GO: walk the whole trail in the best order.
  const trailGo = () => {
    if (trailOn) { stopTrail(); return; }
    if (!previewOrder.length) return;
    stopGo(); setNotice(""); setLocked(previewOrder.map((p) => p.id)); setTracking(true); setStamp(goStamp()); showMap();
  };
  // Reached a pandal (automatically, or by tapping "I'm here").
  const arrive = (p: Pandal, auto = false) => {
    markSeen(p.id);
    if (target?.id === p.id) stopGo();
    const rest = trailOn ? trailOrder.filter((x) => x.id !== p.id) : [];
    const left = trailOn ? rest.length : 1;
    // Visited a different stop than the planned next one? Then the old order is no longer the shortest walk,
    // so plan the remaining stops again, starting from this pandal.
    const outOfOrder = trailOn && rest.length > 1 && trailOrder[0]?.id !== p.id;
    if (outOfOrder) setLocked(plan(p, rest).map((x) => x.id));
    const replanned = outOfOrder ? (lang === "bn" ? " · বাকি স্টপ নতুন করে সাজানো হয়েছে" : " · remaining stops re-planned") : "";
    if (trailOn && left === 0) { stopTrail(); setNotice(`${name(p)} ✓ · ${tx(lang, "trailDone")}`); }
    else setNotice(`${auto ? "📍 " : "✓ "}${name(p)} ${lang === "bn" ? "দেখা হয়েছে" : "marked as seen"}${replanned}`);
    here(p.id);
    if (auto) try { navigator.vibrate?.(200); } catch {}
  };
  // Open from the Saved page with "Trail Go".
  useEffect(() => {
    if (autoTrail.current || !previewOrder.length) return;
    if (new URLSearchParams(window.location.search).get("trail") === "go") { autoTrail.current = true; trailGo(); }
  }, [previewOrder]); // eslint-disable-line

  // Keep following my position while hopping.
  useEffect(() => {
    if (!tracking || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((pos) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      let h: number | null = typeof pos.coords.heading === "number" && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
      const prev = prevMe.current;
      if (h === null && prev && meters(prev, pt) > 6) h = bearing(prev, pt);
      if (!prev || meters(prev, pt) > 6) prevMe.current = pt;
      if (h === null) h = lastHead.current; else lastHead.current = h;
      setMe({ ...pt, acc: pos.coords.accuracy, heading: h });
      setCur((c) => (c && c.id ? c : { ...pt, label: "" })); // GPS start follows me; a picked pandal stays put
    }, () => { setMsg(tx(lang, "blocked")); setTracking(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]); // eslint-disable-line

  // Walking route to the single target (re-fetch only if I've moved ~40 m).
  useEffect(() => {
    if (!target || !origin) return;
    const last = lastFetch.current;
    if (last && last.tid === target.id && last.mode === mode && meters(last.o, origin) < 40) return;
    lastFetch.current = { tid: target.id, o: { lat: origin.lat, lng: origin.lng }, mode };
    const id = ++reqId.current;
    routeFor(mode, origin, target).then((r) => { if (id === reqId.current) setNav({ ...r, tid: target.id, mode }); });
  }, [target, mode, origin?.lat, origin?.lng]); // eslint-disable-line

  // Walking route through all trail stops.
  useEffect(() => {
    const pts: Point[] = origin ? [origin, ...trailOrder] : trailOrder;
    if (pts.length < 2) { setTrailRt(null); lastTrail.current = null; return; }
    const last = lastTrail.current;
    if (last && last.key === rtKey && last.mode === mode && (!origin || !last.o || meters(last.o, origin) < 40)) return;
    lastTrail.current = { key: rtKey, o: origin ? { lat: origin.lat, lng: origin.lng } : null, mode };
    const id = ++trailReq.current;
    routeViaFor(mode, pts).then((r) => { if (id === trailReq.current) setTrailRt({ ...r, key: rtKey, mode }); });
  }, [rtKey, mode, origin?.lat, origin?.lng]); // eslint-disable-line

  // Auto mark seen when I reach the target, or any stop on my trail.
  useEffect(() => {
    if (!me || me.acc > 100) return;
    if (target && meters(me, target) <= 50) { arrive(target, true); return; }
    if (trailOn) { const hit = trailOrder.find((p) => meters(me, p) <= 50); if (hit) arrive(hit, true); }
  }, [me]); // eslint-disable-line

  function gps() {
    setMsg("…");
    if (!navigator.geolocation) return setMsg(tx(lang, "blocked"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (Math.min(...PANDALS.map((p) => km(pt, p))) > 40) return setMsg(tx(lang, "far"));
      setCur({ ...pt, label: "" }); setMe({ ...pt, acc: pos.coords.accuracy, heading: null }); setTracking(true); setPlanned(null); setMsg("");
    }, () => setMsg(tx(lang, "blocked")), { timeout: 8000 });
  }
  const listLen = planned && cur ? pathLen(cur, unseen) : 0;
  const saving = planned && cur ? listLen - pathLen(cur, planned) : 0;

  // ---- What the map shows ----
  const goReady = !!target && nav?.tid === target.id;
  const preset = route ? (ROUTES.find((r) => r.id === route)?.ids.map((i) => byId[i]) ?? []) : [];
  let line: Point[] = [], lineColor = "#c1121f", solid = false;
  if (goReady) { line = nav!.coords; lineColor = "#0077b6"; solid = true; }
  else if (trailOn && rtOk) { line = trailRt!.coords; lineColor = "#6d28d9"; solid = true; }
  else if (planned && cur) { line = [cur, ...planned]; }
  else if (preset.length) { line = preset; }
  else if (rtOk) { line = trailRt!.coords; lineColor = "#6d28d9"; }
  const nextStop = trailOn ? trailOrder[0] : undefined;
  const aim = target ?? nextStop ?? null;
  const youPt = me ?? cur;
  const heading = me?.heading ?? (origin && aim ? bearing(origin, aim) : 0);
  const fitKey = goReady ? stamp : trailOn && rtOk ? stamp : null;
  const navigating = !!target || trailOn;

  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "সহজ পরিক্রমা" : "Live route companion"}</span>
      <h1 className="h1" style={{ fontSize: "clamp(26px,5vw,38px)", marginBottom: 14 }}>{lang === "bn" ? "আপনার হপ রুট" : "Your hop route"}</h1>

      <div className="mapbox" ref={mapBox}>
        <Map pandals={PANDALS} places={mapPlaces} seen={seen} you={youPt} heading={heading} line={line} lineColor={lineColor} solid={solid}
          showPlaces={!!cur} onPick={here} target={aim?.id ?? null} trail={target ? [] : trailOrder.map((p) => p.id)} dim={navigating} fitKey={fitKey} />
      </div>
      <div className="legend" aria-label="Map colours">
        <span><i style={{ background: "#c1121f" }} />{tx(lang, "notSeen")}</span>
        <span><i style={{ background: "#2f9e5b" }} />{tx(lang, "seen")}</span>
        <span><i style={{ background: "#6d28d9" }} />{tx(lang, "trailStop")}</span>
        <span><i style={{ background: "#f2a900" }} />{tx(lang, "goingTo")}</span>
      </div>

      <ModeBar />
      {notice && <div className="card paar" style={{ marginTop: 12, borderLeftColor: "var(--shiuli)" }}><b>{notice}</b></div>}
      {target && (() => {
        const straight = origin ? meters(origin, target) : null;
        return <div className="card paar" style={{ marginTop: 12 }}>
          <p className="zonetag" style={{ margin: 0 }}>➤ {tx(lang, "heading")}</p>
          <h3 style={{ fontSize: 22 }}>{name(target)}</h3>
          <p className="muted small" style={{ margin: "2px 0 0" }}>
            {!origin ? tx(lang, "locating")
              : nav?.tid === target.id && nav.mode === mode ? `${fmtDist(nav.km)} · ~${nav.mins} min${nav.approx ? (lang === "bn" ? " (সরলরেখা, অফলাইন)" : " (straight line, offline)") : ""}${straight !== null ? ` · ${straight < 1000 ? Math.round(straight) + " m" : (straight / 1000).toFixed(1) + " km"} ${tx(lang, "away")}` : ""}`
              : "…"}
          </p>
          {mode === "metro" && nav?.tid === target.id && nav.mode === mode && (
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {nav.trip
                ? (lang === "bn"
                  ? `🚶 ${nav.trip.walk1} মিনিট → 🚇 ${nav.trip.from} থেকে ${nav.trip.to}${nav.trip.stops ? ` (${nav.trip.stops}টি স্টেশন)` : ""} ~${nav.trip.ride} মিনিট → 🚶 ${nav.trip.walk2} মিনিট${nav.trip.change ? " · ট্রেন বদলাতে হতে পারে" : ""}`
                  : `🚶 ${nav.trip.walk1} min → 🚇 ${nav.trip.from} to ${nav.trip.to}${nav.trip.stops ? ` (${nav.trip.stops} stops)` : ""} ~${nav.trip.ride} min → 🚶 ${nav.trip.walk2} min${nav.trip.change ? " · you may need to change trains" : ""}`)
                : (lang === "bn" ? "🚶 এখান থেকে হেঁটে যাওয়াই দ্রুত।" : "🚶 Walking is quicker for this one.")}
            </p>
          )}
          <TransitHint p={target} />
          <p className="muted small" style={{ margin: "4px 0 0" }}>{lang === "bn" ? "৫০ মিটারের মধ্যে পৌঁছলে নিজে থেকেই দেখা চিহ্নিত হবে।" : "It will be marked as seen automatically when you're within 50 m."}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => arrive(target)}>✓ {tx(lang, "imHere")}</button>
            <button className="btn outline" onClick={stopGo}>{tx(lang, "stop")}</button>
          </div>
        </div>;
      })()}
      {trailOn && nextStop && (() => {
        const straight = origin ? meters(origin, nextStop) : null;
        const leg = legFor(0);
        return <div className="card paar" style={{ marginTop: 12, borderLeftColor: "#6d28d9" }}>
          <p className="zonetag" style={{ margin: 0, color: "#6d28d9" }}>▶ {tx(lang, "trailGo")} · {trailOrder.length} {lang === "bn" ? "টি স্টপ বাকি" : trailOrder.length === 1 ? "stop left" : "stops left"}</p>
          <h3 style={{ fontSize: 22 }}>{tx(lang, "nextStop")}: {name(nextStop)}</h3>
          <p className="muted small" style={{ margin: "2px 0 0" }}>
            {!origin ? tx(lang, "locating") : `${leg !== null ? `${fmtDist(leg)} · ~${Math.max(1, Math.round(leg * 12))} min` : "…"}${straight !== null ? ` · ${straight < 1000 ? Math.round(straight) + " m" : (straight / 1000).toFixed(1) + " km"} ${tx(lang, "away")}` : ""}`}
          </p>
          <p className="muted small" style={{ margin: "4px 0 0" }}>{lang === "bn" ? "প্রতিটি স্টপের ৫০ মিটারের মধ্যে পৌঁছলে নিজে থেকেই দেখা চিহ্নিত হবে।" : "Each stop is marked seen automatically when you're within 50 m."}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => arrive(nextStop)}>✓ {tx(lang, "imHere")}</button>
            {origin && trailOrder.length > 1 && <button className="btn outline" onClick={() => { setLocked(plan(origin, trailOrder).map((x) => x.id)); setNotice(lang === "bn" ? "বাকি স্টপ আপনার বর্তমান অবস্থান থেকে নতুন করে সাজানো হয়েছে" : "Remaining stops re-planned from where you are"); }}>↻ {lang === "bn" ? "এখান থেকে নতুন করে সাজান" : "Re-plan from here"}</button>}
            <button className="btn outline" onClick={stopTrail}>{tx(lang, "stopTrail")}</button>
          </div>
        </div>;
      })()}

      <div className="card sec" style={{ marginTop: 16 }}>
        <label className="muted small" style={{ fontWeight: 600 }}><Bi k="where" /></label>
        <div className="locrow" style={{ marginTop: 6 }}>
          <PandalPicker onPick={here} />
          <button className="btn outline" onClick={gps}>📍 <Bi k="gps" caption={false} /></button>
        </div>
        {cur && <p className="muted small" style={{ margin: "8px 0 0" }}>📍 <b>{cur.id ? cur.label : tx(lang, "gps")}</b></p>}
        {msg && <p className="msg">{msg}</p>}
        <div role="progressbar" aria-valuenow={seenN} aria-valuemax={PANDALS.length} aria-label="Pandals seen" style={{ height: 10, borderRadius: 99, background: "var(--blush)", overflow: "hidden", margin: "12px 0 6px" }}>
          <span style={{ display: "block", height: "100%", width: `${(seenN / Math.max(1, PANDALS.length)) * 100}%`, background: "var(--shiuli)" }} />
        </div>
        <p className="muted small" style={{ margin: 0 }}>{seenN} {lang === "bn" ? "টি দেখা হয়েছে" : "visited"} · {countLabel} {lang === "bn" ? "টি প্যান্ডেল মানচিত্রে" : "pandals on the map"}</p>
      </div>

      <section className="sec" id="trail">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h2">★ {tx(lang, "myTrail")} ({trailAll.length})</h2>
          <Link className="btn sm outline" href="/saved">{tx(lang, "openTrail")} →</Link>
        </div>
        {trailAll.length === 0 ? <div className="empty" style={{ marginTop: 12 }}>{tx(lang, "trailEmpty")}</div> : <>
          {trailStops.length > 0 && <div className="card paar" style={{ marginTop: 12, borderLeftColor: "#6d28d9" }}>
            <p className="muted small" style={{ margin: 0 }}>
              {tx(lang, "bestOrder")} · {trailStops.length} {lang === "bn" ? "টি স্টপ" : trailStops.length === 1 ? "stop" : "stops"}
              {rtOk && trailRt!.km > 0 ? ` · ${fmtDist(trailRt!.km)} · ~${trailRt!.mins} min${trailRt!.approx ? (lang === "bn" ? " (সরলরেখা)" : " (straight line)") : ""}` : ""}
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className={`btn big ${trailOn ? "gold" : "primary"}`} onClick={trailGo}>{trailOn ? "■ " + tx(lang, "stopTrail") : "▶ " + tx(lang, "trailGo")}</button>
            </div>
          </div>}
          <div className="card" style={{ marginTop: 12 }}>
            {trailOrder.map((p, i) => {
              const leg = legFor(i);
              const from = i === 0 ? (rtHasOrigin ? (lang === "bn" ? "আপনার থেকে" : "from you") : (lang === "bn" ? "শুরু" : "start here")) : (lang === "bn" ? `স্টপ ${i} থেকে` : `from stop ${i}`);
              return (
                <div className="titem" key={p.id}>
                  <div className="tleft">
                    <span className="tnum">{i + 1}</span>
                    <div><h3>{name(p)}</h3><p>{leg !== null ? `${fmtDist(leg)} · ~${Math.max(1, Math.round(leg * 12))} min ${from}` : from}</p></div>
                  </div>
                  <div className="tact">
                    <button className={`btn sm ${target?.id === p.id ? "gold" : "primary"}`} onClick={() => go(p)}>➤ {target?.id === p.id ? tx(lang, "stop") : tx(lang, "go")}</button>
                    <button className="btn sm outline" aria-label={tx(lang, "markSeen")} onClick={() => arrive(p)}>✓</button>
                    <button className="btn sm" aria-label="Remove from my trail" onClick={() => setSaved(saved.filter((x) => x !== p.id))}>✕</button>
                  </div>
                </div>
              );
            })}
            {trailSeen.map((p) => (
              <div className="titem" key={p.id} style={{ opacity: 0.8 }}>
                <div className="tleft">
                  <span className="tnum done">✓</span>
                  <div><h3>{name(p)}</h3><p>{tx(lang, "seen")}</p></div>
                </div>
                <div className="tact">
                  <button className="btn sm outline" onClick={() => unmarkSeen(p.id)}>✕ {tx(lang, "unmark")}</button>
                  <button className="btn sm" aria-label="Remove from my trail" onClick={() => setSaved(saved.filter((x) => x !== p.id))}>★</button>
                </div>
              </div>
            ))}
          </div>
        </>}
      </section>

      <section className="sec">
        {!cur ? <div className="empty"><Bi k="empty" caption={false} /></div>
          : !nearest.length ? <div className="empty"><Bi k="doneAll" caption={false} /></div> : <>
          <h2 className="h2">{tx(lang, "nearest")} {cur.id ? cur.label : tx(lang, "gps")}</h2>
          <div className="pgrid" style={{ marginTop: 14 }}>
            {nearest.slice(0, nearLimit).map((x, i) => (
              <PandalCard key={x.p.id} p={x.p} rank={i + 1} dist={`${fmtDist(x.d)} · ~${listMins(mode, x.d, cur, x.p)} min`}
                seen={false} saved={false} onSave={() => addTrail(x.p)}
                onGo={() => go(x.p)} going={target?.id === x.p.id} onSeen={() => arrive(x.p)}>
                <button className="btn outline" style={{ marginTop: 8 }} onClick={() => addTrail(x.p)}>☆ {tx(lang, "addRoute")}</button>
              </PandalCard>
            ))}
          </div>
          {nearest.length > nearLimit && <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn outline big" onClick={() => setNearLimit(nearLimit + 6)}>{tx(lang, "more")} ({nearest.length - nearLimit})</button>
          </div>}
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
          {planned && (() => {
            const trailList = [...trailOrder, ...trailSeen];
            const trailTitle = lang === "bn" ? "আমার পুজো ট্রেইল" : "My Pandal Trail";
            return <>
              <div className="card paar" style={{ marginTop: 14, borderLeftColor: "#6d28d9" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ fontSize: 22 }}>★ {tx(lang, "curTrail")} ({trailList.length})</h3>
                  {trailList.length > 0 && <div className="row">
                    <button className="btn sm primary" onClick={() => doExport(trailTitle, trailList)}>📄 {tx(lang, "exportPdf")}</button>
                    <button className="btn sm outline" onClick={() => shareTrail(trailList)}>↗ {tx(lang, "shareShort")}</button>
                  </div>}
                </div>
                {trailList.length === 0 ? <p className="muted small" style={{ margin: "8px 0 0" }}>{tx(lang, "curTrailEmpty")}</p> : trailList.map((p, i) => (
                  <div className="titem" key={p.id}>
                    <div className="tleft">
                      <span className={`tnum ${seen.includes(p.id) ? "done" : ""}`}>{seen.includes(p.id) ? "✓" : i + 1}</span>
                      <div><h3>{name(p)}</h3>{p.area && <p>{p.area}</p>}</div>
                    </div>
                    <div className="tact"><button className="btn sm outline" onClick={() => removeTrail(p)}>✕ {tx(lang, "removeTrail")}</button></div>
                  </div>
                ))}
              </div>
              <div className="card paar" style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ fontSize: 22 }}>{tx(lang, "order")}</h3>
                  <button className="btn sm outline" onClick={() => doExport(lang === "bn" ? "আমার পুজো পরিক্রমা" : "My Pandal Hopping Plan", planned)}>📄 {tx(lang, "exportPdf")}</button>
                </div>
                <p className="muted small">{planned.length} stops · {fmtDist(pathLen(cur, planned))}</p>
                {planned.slice(0, planLimit).map((p, i) => (
                  <div className="titem" key={p.id}>
                    <div className="tleft">
                      <span className="tnum plain">{i + 1}</span>
                      <div><h3>{name(p)}</h3>{p.area && <p>{p.area}</p>}</div>
                    </div>
                    <div className="tact">
                      <button className={`btn sm ${saved.includes(p.id) ? "gold" : "outline"}`} onClick={() => toggleTrail(p)}>{saved.includes(p.id) ? "★ " + tx(lang, "inTrail") : "☆ " + tx(lang, "addRoute")}</button>
                    </div>
                  </div>
                ))}
                {planned.length > planLimit && <div style={{ textAlign: "center", marginTop: 12 }}>
                  <button className="btn outline" onClick={() => setPlanLimit(planLimit + 40)}>{tx(lang, "more")} ({planned.length - planLimit})</button>
                </div>}
              </div>
            </>;
          })()}
        </>}
      </section>

      {cur && <section className="sec">
        <h2 className="h2"><Bi k="eatNear" caption={false} /></h2>
        <div className="card" style={{ marginTop: 12 }}>
          {food.map((x) => <div className="item" key={x.f.id}><div><h3>{x.f.name}</h3><p>{x.f.note}</p></div><b className="muted small">{fmtDist(x.d)} · {listMins(mode, x.d, cur, x.f)} min</b></div>)}
          <Link className="btn outline" href="/food" style={{ marginTop: 10 }}>{tx(lang, "food")} →</Link>
        </div>
      </section>}

      <section className="sec">
        <h2 className="h2">✓ {tx(lang, "visited")} ({visited.length})</h2>
        {visited.length === 0 ? <div className="empty" style={{ marginTop: 12 }}>{tx(lang, "visitedEmpty")}</div> : (
          <div className="card" style={{ marginTop: 12 }}>
            {visited.map((p) => (
              <div className="titem" key={p.id}>
                <div className="tleft"><div><h3>{name(p)}</h3>{p.area && <p>{p.area}</p>}</div></div>
                <div className="tact"><button className="btn sm outline" onClick={() => unmarkSeen(p.id)}>✕ {tx(lang, "unmark")}</button></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sec">
        <h2 className="h2"><Bi k="routes" caption={false} /></h2>
        <div className="grid3" style={{ marginTop: 14 }}>
          {routesShown.map((r) => (
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
        {routeList.length > 3 && <button className="btn outline" style={{ marginTop: 12 }} onClick={() => setMoreRoutes(!moreRoutes)}>{moreRoutes ? "Show fewer routes" : `Show more routes (${Math.min(12, routeList.length) - 3} more)`}</button>}
      </section>
      {toast && <div className="toast" role="status" aria-live="polite">
        <span>{toast.text}</span>
        {toast.undo && <button onClick={() => { toast.undo?.(); setToast(null); }}>{lang === "bn" ? "ফেরান" : "Undo"}</button>}
      </div>}
    </div>
  );
}
