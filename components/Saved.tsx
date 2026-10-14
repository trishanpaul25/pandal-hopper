"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PANDALS, PLACES, ROUTES, ZONES, byId } from "@/lib/data";
import { fmtDist, pathLen, plan, travelMins } from "@/lib/geo";
import { trailMins } from "@/lib/transit";
import { tx } from "@/lib/i18n";
import { useLang } from "@/lib/lang";
import { modeInfo, useMode } from "@/lib/mode";
import { useWhen } from "@/lib/when";
import ModeBar from "@/components/ModeBar";
import { toggleIn, useSaved, useSavedPlaces, useSeen } from "@/lib/store";
import { MAX_NAME, MAX_TRAILS, useTrails } from "@/lib/trails";
import AddCircuit from "@/components/AddCircuit";
import ShareTrail from "@/components/ShareTrail";

export default function Saved() {
  const { lang } = useLang();
  const { mode } = useMode();
  const { at } = useWhen();
  const [seen, setSeen] = useSeen();
  const [saved, setSaved] = useSaved();
  const [sp, setSp] = useSavedPlaces();
  const T = useTrails();
  const bn = lang === "bn";
  const [ordered, setOrdered] = useState(false);
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [showCircuits, setShowCircuits] = useState(false);
  const circuitZones = useMemo(() => Array.from(new Set(ROUTES.map((r) => r.zone ?? "others"))), []);
  const [zone, setZone] = useState(circuitZones.includes("south") ? "south" : circuitZones[0]);
  const circuits = ROUTES.filter((r) => (r.zone ?? "others") === zone);
  const createTrail = () => {
    if (T.create(newName) === null) { setNote(bn ? "ট্রেইলের সীমা শেষ।" : `You can keep up to ${MAX_TRAILS} trails.`); return; }
    setNewName(""); setNote("");
  };
  const commitRename = () => { if (renaming) T.rename(renaming, renameVal); setRenaming(null); };
  const base = saved.map((i) => byId[i]).filter((p) => p && p.precision !== "approx");
  const trail = useMemo(() => (ordered && base.length > 1 ? [base[0], ...plan(base[0], base.slice(1))] : base), [ordered, saved]); // eslint-disable-line
  const len = trail.length > 1 ? pathLen(trail[0], trail.slice(1)) : 0;
  const places = sp.map((i) => PLACES.find((p) => p.id === i)).filter(Boolean) as typeof PLACES;
  const name = (p: { name: string; name_bn?: string }) => (lang === "bn" && p.name_bn) || p.name;
  const firstUnseen = trail.find((p) => !seen.includes(p.id));

  async function share() {
    const text = `${T.active.name} (Pandal Hopper)\n` + trail.map((p, i) => `${i + 1}. ${p.name}${p.area ? ` (${p.area})` : ""}`).join("\n") +
      (places.length ? `\n\nEat/see:\n` + places.map((p) => `- ${p.name}`).join("\n") : "");
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setNote("Copied. Paste it into WhatsApp."); } }
    catch { try { await navigator.clipboard.writeText(text); setNote("Copied. Paste it into WhatsApp."); } catch { setNote("Couldn't share on this device."); } }
  }

  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "আমার সংরক্ষিত তালিকা" : "My parikrama trail"}</span>
      <h1 className="h1">{T.active.name}</h1>
      <p className="lead">{T.active.group
        ? (lang === "bn" ? `${T.active.group.groupName} দলের শেয়ার করা ট্রেইল। দলের সবাই এটি বদলাতে পারবেন।` : `A trail shared with ${T.active.group.groupName}. Everyone in the group can edit it.`)
        : (lang === "bn" ? "পছন্দের প্যান্ডেল ও খাবারের জায়গা এখানে জমা থাকে। শুধু আপনার ফোনে সংরক্ষিত।" : "Pandals and eateries you starred. Saved on this phone only.")}</p>
      <div className="stats">
        <div className="stat"><b>{trail.length}</b><span>{lang === "bn" ? "সংরক্ষিত প্যান্ডেল" : "Saved pandals"}</span></div>
        <div className="stat"><b>{trail.filter((p) => seen.includes(p.id)).length}</b><span>{lang === "bn" ? "দেখা হয়েছে" : "Seen already"}</span></div>
        <div className="stat"><b>{places.length}</b><span>{lang === "bn" ? "খাবার ও দর্শনীয়" : "Saved eats & sights"}</span></div>
        <div className="stat"><b>{len ? fmtDist(len) : "—"}</b><span>{len ? `~${mode === "metro" ? trailMins(mode, trail, at ?? undefined) : travelMins(len, mode)} min ${lang === "bn" ? modeInfo(mode).per.bn : modeInfo(mode).per.en}` : (lang === "bn" ? "ট্রেইলের দৈর্ঘ্য" : "Trail length")}</span></div>
      </div>

      <section className="sec" style={{ marginTop: 16 }}>
        <h2 className="h2">{bn ? "আমার ট্রেইলগুলো" : "My trails"}</h2>
        <div className="chips" role="tablist" aria-label={bn ? "ট্রেইল" : "Trails"}>
          {T.trails.map((t) => <button key={t.id} role="tab" className="chip" aria-pressed={t.id === T.activeId} aria-selected={t.id === T.activeId} onClick={() => T.setActive(t.id)}>{t.group ? "👥 " : ""}{t.name} · {t.ids.length}</button>)}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="search" style={{ flex: 1, minWidth: 180 }} type="text" maxLength={MAX_NAME} autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createTrail(); }}
            placeholder={bn ? "নতুন ট্রেইলের নাম, যেমন “অষ্টমীর রাত”" : "Name a new trail, e.g. “Ashtami night”"} aria-label={bn ? "নতুন ট্রেইলের নাম" : "New trail name"} />
          <button className="btn primary" onClick={createTrail}>＋ {bn ? "নতুন ট্রেইল" : "New trail"}</button>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          {renaming === T.activeId ? <>
            <input className="search" style={{ flex: 1, minWidth: 160, minHeight: 40 }} autoFocus type="text" maxLength={MAX_NAME} value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }} aria-label={bn ? "ট্রেইলের নাম" : "Trail name"} />
            <button className="btn sm primary" onClick={commitRename}>{bn ? "সেভ" : "Save"}</button>
            <button className="btn sm outline" onClick={() => setRenaming(null)}>{bn ? "বাতিল" : "Cancel"}</button>
          </> : <>
            <button className="btn sm outline" onClick={() => { setRenaming(T.activeId); setRenameVal(T.active.name); }}>✎ {bn ? "নাম বদলান" : "Rename"}</button>
            {!T.active.group && T.localTrails.length > 1 && <button className="btn sm outline" onClick={() => { if (window.confirm(bn ? `“${T.active.name}” মুছবেন?` : `Delete “${T.active.name}”? Its ${T.active.ids.length} stops will be removed from this trail.`)) T.remove(T.activeId); }}>🗑 {bn ? "মুছুন" : "Delete trail"}</button>}
          </>}
        </div>
        <ShareTrail />
      </section>

      <section className="sec">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h2">{bn ? "তৈরি সার্কিট" : "Pre-built circuits"}</h2>
          <button className="btn sm outline" aria-expanded={showCircuits} onClick={() => setShowCircuits(!showCircuits)}>{showCircuits ? (bn ? "লুকান" : "Hide") : (bn ? `${ROUTES.length}টি সার্কিট দেখুন` : `Browse ${ROUTES.length} circuits`)}</button>
        </div>
        <p className="muted small" style={{ margin: "4px 0 0" }}>{bn ? `যোগ করলে সার্কিটের সব স্টপ “${T.active.name}”-এ যাবে।` : `Adding a circuit puts all its stops into “${T.active.name}”, or start a fresh trail from it.`}</p>
        {showCircuits && <>
          <div className="chips">
            {circuitZones.map((z) => <button key={z} className="chip" aria-pressed={zone === z} onClick={() => setZone(z)}>{(ZONES[z] && (bn ? ZONES[z].bn : ZONES[z].en)) || z} · {ROUTES.filter((r) => (r.zone ?? "others") === z).length}</button>)}
          </div>
          <div className="grid3">
            {circuits.map((r) => <div className="card paar" key={r.id}>
              <h3 style={{ fontSize: 19 }}>{r.name}</h3>
              <p className="muted small" style={{ margin: "4px 0 6px" }}>{r.blurb}</p>
              <p className="small" style={{ margin: 0 }}><b>{r.ids.length}</b> {bn ? "স্টপ" : "stops"} · ~<b>{fmtDist(r.km)}</b></p>
              <AddCircuit route={r} />
            </div>)}
          </div>
        </>}
      </section>

      <ModeBar />

      {trail.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          Nothing in this trail yet. Tap the ☆ on any pandal, or add a pre-built circuit above. <Link href="/pandals" style={{ color: "var(--alta)", fontWeight: 600 }}>Browse pandals</Link>
        </div>
      ) : (
        <section className="sec">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h2">{lang === "bn" ? "ট্রেইলের ক্রম" : "Trail order"}</h2>
            <div className="row">
              <button className={`btn sm ${ordered ? "primary" : "outline"}`} aria-pressed={ordered} onClick={() => setOrdered(!ordered)}>{lang === "bn" ? "কম হাঁটার ক্রমে সাজান" : "Shortest walk order"}</button>
              <button className="btn sm outline" onClick={share}>{tx(lang, "share")}</button>
              {firstUnseen && <Link className="btn sm primary" href="/hop?trail=go">▶ {tx(lang, "trailGo")}</Link>}
            </div>
          </div>
          {note && <p className="msg">{note}</p>}
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {trail.map((p, i) => (
              <div className="card paar" key={p.id} style={{ borderLeftColor: seen.includes(p.id) ? "var(--shiuli)" : "var(--alta)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <div>
                  <p className="zonetag" style={{ margin: 0 }}>STOP {i + 1}{i > 0 ? ` · ${fmtDist(pathLen(trail[i - 1], [p]))} from previous` : ""}</p>
                  <h3 style={{ fontSize: 20 }}>{name(p)}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{p.area}</p>
                </div>
                <div className="row">
                  <button className={`btn sm ${seen.includes(p.id) ? "gold" : "outline"}`} onClick={() => setSeen(toggleIn(seen, p.id))}>{seen.includes(p.id) ? "✕ " + tx(lang, "unmark") : "✓ " + tx(lang, "markSeen")}</button>
                  <Link className="btn sm outline" href={`/hop?from=${p.id}`}>{tx(lang, "hopFrom")}</Link>
                  <button className="btn sm" aria-label="Remove from trail" onClick={() => setSaved(saved.filter((x) => x !== p.id))}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {places.length > 0 && <section className="sec">
        <h2 className="h2">{lang === "bn" ? "সংরক্ষিত খাবার ও দর্শনীয়" : "Saved eats & sights"}</h2>
        <div className="card" style={{ marginTop: 12 }}>
          {places.map((f) => <div className="item" key={f.id}><div><h3>{f.name}<span className="tag">{f.type === "food" ? tx(lang, "foodT") : tx(lang, "sightT")}</span></h3><p>{f.note}</p></div>
            <button className="btn sm" aria-label="Remove" onClick={() => setSp(sp.filter((x) => x !== f.id))}>✕</button></div>)}
        </div>
      </section>}
      <p className="muted small" style={{ marginTop: 18 }}>{PANDALS.length} pandals in this list.</p>
    </div>
  );
}
