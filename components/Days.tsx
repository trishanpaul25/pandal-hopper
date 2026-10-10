"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Bi from "@/components/Bi";
import { DAYS } from "@/lib/data";
import { useLang } from "@/lib/lang";

export default function Days() {
  const { lang } = useLang();
  const [today, setToday] = useState("");
  useEffect(() => { setToday(new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10)); }, []); // IST date
  return (
    <div className="page">
      <span className="eyebrow">নির্ঘণ্ট</span>
      <h1 className="h1">{lang === "bn" ? "পুজোর দিনপঞ্জি ২০২৬" : "Puja days, 2026"}</h1>
      <p className="lead">{lang === "bn" ? "ছয় দিনই প্যান্ডেল খোলা। কোন রাতে কোন রুট, সেটা এখান থেকে ঠিক করুন।" : "Pandals are open all six days. Use this to pick which night suits your route."}</p>
      <div className="days" style={{ marginTop: 18 }}>
        {DAYS.map((d) => (
          <div className={`day ${today === d.date ? "today" : ""}`} key={d.date}>
            {today === d.date && <span className="badge" style={{ position: "static", display: "inline-block", marginBottom: 6, background: "var(--gold)", color: "#2a0a0e" }}>Today</span>}
            <div className="dt">{d.d}</div><div className="wd">{d.wd}</div>
            <h3>{lang === "bn" ? d.bn : d.en}</h3><span className="cap">{lang === "bn" ? d.en : d.bn}</span>
            <p style={{ margin: "8px 0 0" }}>{d.what}</p>
            <div className="tip">💡 {d.tip}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>Different panjikas place Saptami on 17 or 18 October, so ritual times vary. Exact times for Sandhi Puja and the rest come from the panjika your local club follows. Check the club's own announcement.</p>
      <div className="row" style={{ marginTop: 10 }}><Link className="btn primary big" href="/hop"><Bi k="start" caption={false} /></Link></div>
    </div>
  );
}
