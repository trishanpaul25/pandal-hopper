"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DAYS, PUJA_START } from "@/lib/data";
import { useLang } from "@/lib/lang";
import "./PujaClock.css";

const START = new Date(PUJA_START).getTime();      // 16 Oct 2026, 00:00 IST
const DAY = 864e5;
const END = START + DAYS.length * DAY;
const pad = (n: number) => String(n).padStart(2, "0");

/** Before the puja: a live countdown to Maha Shashthi. During the puja: only today's day. After: Shubho Bijoya. */
export default function PujaClock() {
  const { lang } = useLang();
  const [now, setNow] = useState<number | null>(null);
  const prevSec = useRef(-1);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (now === null) return <div className="pclock" style={{ minHeight: 190 }} aria-hidden />;

  // before the puja
  if (now < START) {
    const left = START - now;
    const d = Math.floor(left / DAY), h = Math.floor((left % DAY) / 36e5), m = Math.floor((left % 36e5) / 6e4), s = Math.floor((left % 6e4) / 1e3);
    const tick = prevSec.current !== s; prevSec.current = s;
    const units: [string, string, string][] = [
      [String(d), "Days", "দিন"], [pad(h), "Hours", "ঘণ্টা"], [pad(m), "Minutes", "মিনিট"], [pad(s), "Seconds", "সেকেন্ড"],
    ];
    return (
      <div className="pclock" role="timer" aria-label={`${d} days, ${h} hours, ${m} minutes until Maha Shashthi`}>
        <h3 className="pclock-title">{lang === "bn" ? "মহাষষ্ঠী শুরু হতে বাকি" : "Until Maha Shashthi"}</h3>
        <p className="pclock-sub">{lang === "bn" ? "শুক্রবার, ১৬ অক্টোবর ২০২৬" : "Friday, 16 October 2026"}</p>
        <div className="pclock-units">
          {units.map(([n, en, bn], i) => (
            <span key={en} style={{ display: "contents" }}>
              {i > 0 && <span className="pclock-dot" aria-hidden>:</span>}
              <span className="pclock-unit">
                <span key={en === "Seconds" ? n : en} className={`pclock-num ${en === "Seconds" && tick ? "tick" : ""}`}>{n}</span>
                <span className="pclock-lab">{lang === "bn" ? bn : en}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // after the puja
  if (now >= END) {
    return (
      <div className="pclock">
        <h3 className="pclock-title">{lang === "bn" ? "শুভ বিজয়া!" : "Shubho Bijoya!"}</h3>
        <p className="pclock-sub" style={{ marginBottom: 0 }}>{lang === "bn" ? "আসছে বছর আবার হবে।" : "Asche bochor abar hobe. See you next year."}</p>
      </div>
    );
  }

  // during the puja: only today's information (dates are in Indian time)
  const today = new Date(now + 5.5 * 36e5).toISOString().slice(0, 10);
  const idx = Math.max(0, DAYS.findIndex((x) => x.date === today));
  const d = DAYS[idx];
  return (
    <div className="pclock">
      <div className="pday-steps" aria-label={`Day ${idx + 1} of ${DAYS.length}`}>
        {DAYS.map((x, i) => <i key={x.date} className={i < idx ? "done" : i === idx ? "now" : ""} />)}
      </div>
      <p className="pday-date">{d.d} · {d.wd}</p>
      <h3 className="pday-name">{lang === "bn" ? d.bn : d.en}</h3>
      <span className="pday-bn">{lang === "bn" ? d.en : d.bn}</span>
      <p className="pday-what">{d.what}</p>
      <span className="pday-tip">💡 {d.tip}</span>
      <Link className="pday-link" href="/days">{lang === "bn" ? "সব দিনের তথ্য দেখুন →" : "See all six days →"}</Link>
    </div>
  );
}
