"use client";
import Link from "next/link";
import Countdown from "@/components/Countdown";
import PujaClock from "@/components/PujaClock";
import Bi from "@/components/Bi";
import { Arch } from "@/components/Art";
import dynamic from "next/dynamic";
import { PANDALS, PLACES, ZONES } from "@/lib/data";
import { useLang } from "@/lib/lang";
import { useTheme } from "@/lib/theme";

const AllPandalsMap = dynamic(() => import("@/components/AllPandalsMap"), { ssr: false, loading: () => <div className="allmap" /> });

export default function Home() {
  const { lang } = useLang();
  const { theme, toggle } = useTheme();
  return (
    <div className="page">
      <section className="hero">
        <div>
          <span className="eyebrow">16 – 21 October 2026 · শারদোৎসব</span>
          <h1 className="h1">{lang === "bn" ? "ঘুরে ঘুরে হয়রান নয়," : "Don't wander."}<br />{lang === "bn" ? "সহজে হপ করুন।" : "Hop Kolkata."}</h1>
          <p className="lead">{lang === "bn" ? "আপনি কোথায় আছেন বলুন। আমরা দেখাব কাছের না-দেখা প্যান্ডেল, আর পথে কোথায় খাবেন।" : "Tell us where you are. We point you to the nearest pandal you haven't seen, and show where to eat on the way."}</p>
          <Countdown />
          <div className="row">
            <Link className="btn primary big" href="/hop"><Bi k="start" caption={false} /></Link>
            <Link className="btn outline big" href="/pandals"><Bi k="browse" caption={false} /></Link>
          </div>
        </div>
        <div className="archframe"><Arch tone="north" /></div>
      </section>

      <section className="sec">
        <span className="eyebrow">{lang === "bn" ? "সহজ পরিক্রমা" : "Seamless parikrama"}</span>
        <h2 className="h2">{lang === "bn" ? "তিন ধাপে পুজো ঘোরা" : "Hop through Kolkata in 3 steps"}</h2>
        <div className="grid3" style={{ marginTop: 14 }}>
          {[
            ["1", "Pick your start", "শুরুর জায়গা বাছুন", "Choose a pandal, tap the map, or use your location. Starting from anywhere works."],
            ["2", "Follow the nearest", "কাছেরটি অনুসরণ করুন", "See the next three closest pandals with walking time, or plan the whole night in one order."],
            ["3", "Tick off and eat", "দেখা চিহ্নিত করুন", "Mark pandals as seen and save stops to your trail. Everything stays on your phone."],
          ].map(([n, t, b, d]) => (
            <div key={n} className="card step"><div className="no">STEP {n}</div><h3>{lang === "bn" ? b : t}</h3><p className="muted">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="sec">
        <span className="eyebrow">{lang === "bn" ? "পুজোর পঞ্জিকা" : "Puja almanac"}</span>
        <PujaClock />
      </section>

      <section className="sec">
        <span className="eyebrow">{lang === "bn" ? "বাছাই করা সার্কিট" : "Curated circuits"}</span>
        <h2 className="h2">{lang === "bn" ? "আপনার এলাকা বাছুন" : "Choose your area"}</h2>
        <div className="grid3" style={{ marginTop: 14 }}>
          {Object.entries(ZONES).map(([k, z]) => (
            <Link key={k} href={`/pandals?zone=${k}`} style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="pthumb" style={{ height: 130, overflow: "hidden" }}><Arch tone={k} /></div>
                <div style={{ padding: 16 }}>
                  <h3 style={{ fontSize: 21 }}>{z[lang]}</h3><span className="cap">{z[lang === "en" ? "bn" : "en"]}</span>
                  <p className="muted" style={{ margin: "6px 0" }}>{z.blurb}</p>
                  <b style={{ color: "var(--alta)", fontSize: 13 }}>{PANDALS.filter((p) => p.zone === k).length} pandals →</b>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>{PANDALS.length} pandals and {PLACES.length} food and sight stops.</p>
      </section>

      <section className="sec" id="map">
        <span className="eyebrow">{lang === "bn" ? "সব প্যান্ডেল একসাথে" : "Every pandal, one map"}</span>
        <h2 className="h2">{lang === "bn" ? "সব প্যান্ডেলের মানচিত্র" : "All pandals map"}</h2>
        <AllPandalsMap />
      </section>

      <section className="sec">
        <div className="cta">
          <div>
            <span className="eyebrow">{lang === "bn" ? "রাতের পরিক্রমা" : "After midnight"}</span>
            <h2>{lang === "bn" ? "মাঝরাতে ঘুরছেন?" : "Hopping after midnight?"}</h2>
            <p>{lang === "bn" ? "রাতের মোড চালু করুন: গাঢ় রঙ, কম আলো, চোখে আরাম।" : "Switch on Night mode: darker colours that are easier on the eyes and the battery."}</p>
          </div>
          <div className="row">
            <button className="btn primary big" onClick={toggle}>{theme === "dark" ? "☀️" : "🌙"} <Bi k={theme === "dark" ? "day" : "night"} caption={false} /></button>
            <Link className="btn big" href="/guide" style={{ background: "var(--alta)", color: "#2a0a0e", borderColor: "var(--alta)" }}><Bi k="sos" caption={false} /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
