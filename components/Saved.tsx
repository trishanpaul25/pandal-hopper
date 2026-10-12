"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PANDALS, PLACES, byId } from "@/lib/data";
import { fmtDist, pathLen, plan, travelMins } from "@/lib/geo";
import { trailMins } from "@/lib/transit";
import { tx } from "@/lib/i18n";
import { useLang } from "@/lib/lang";
import { modeInfo, useMode } from "@/lib/mode";
import ModeBar from "@/components/ModeBar";
import { toggleIn, useSaved, useSavedPlaces, useSeen } from "@/lib/store";

export default function Saved() {
  const { lang } = useLang();
  const { mode } = useMode();
  const [seen, setSeen] = useSeen();
  const [saved, setSaved] = useSaved();
  const [sp, setSp] = useSavedPlaces();
  const [ordered, setOrdered] = useState(false);
  const [note, setNote] = useState("");
  const base = saved.map((i) => byId[i]).filter((p) => p && p.precision !== "approx");
  const trail = useMemo(() => (ordered && base.length > 1 ? [base[0], ...plan(base[0], base.slice(1))] : base), [ordered, saved]); // eslint-disable-line
  const len = trail.length > 1 ? pathLen(trail[0], trail.slice(1)) : 0;
  const places = sp.map((i) => PLACES.find((p) => p.id === i)).filter(Boolean) as typeof PLACES;
  const name = (p: { name: string; name_bn?: string }) => (lang === "bn" && p.name_bn) || p.name;
  const firstUnseen = trail.find((p) => !seen.includes(p.id));

  async function share() {
    const text = `My Durga Puja trail (Pandal Hopper)\n` + trail.map((p, i) => `${i + 1}. ${p.name}${p.area ? ` (${p.area})` : ""}`).join("\n") +
      (places.length ? `\n\nEat/see:\n` + places.map((p) => `- ${p.name}`).join("\n") : "");
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setNote("Copied. Paste it into WhatsApp."); } }
    catch { try { await navigator.clipboard.writeText(text); setNote("Copied. Paste it into WhatsApp."); } catch { setNote("Couldn't share on this device."); } }
  }

  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "আমার সংরক্ষিত তালিকা" : "My parikrama trail"}</span>
      <h1 className="h1">{lang === "bn" ? "আমার ট্রেইল" : "My saved trail"}</h1>
      <p className="lead">{lang === "bn" ? "পছন্দের প্যান্ডেল ও খাবারের জায়গা এখানে জমা থাকে। শুধু আপনার ফোনে সংরক্ষিত।" : "Pandals and eateries you starred. Saved on this phone only."}</p>
      <div className="stats">
        <div className="stat"><b>{trail.length}</b><span>{lang === "bn" ? "সংরক্ষিত প্যান্ডেল" : "Saved pandals"}</span></div>
        <div className="stat"><b>{trail.filter((p) => seen.includes(p.id)).length}</b><span>{lang === "bn" ? "দেখা হয়েছে" : "Seen already"}</span></div>
        <div className="stat"><b>{places.length}</b><span>{lang === "bn" ? "খাবার ও দর্শনীয়" : "Saved eats & sights"}</span></div>
        <div className="stat"><b>{len ? fmtDist(len) : "—"}</b><span>{len ? `~${mode === "metro" ? trailMins(mode, trail) : travelMins(len, mode)} min ${lang === "bn" ? modeInfo(mode).per.bn : modeInfo(mode).per.en}` : (lang === "bn" ? "ট্রেইলের দৈর্ঘ্য" : "Trail length")}</span></div>
      </div>

      <ModeBar />

      {trail.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          Nothing saved yet. Tap the ☆ on any pandal to add it. <Link href="/pandals" style={{ color: "var(--alta)", fontWeight: 600 }}>Browse pandals</Link>
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
