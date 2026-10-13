"use client";
import { useLang } from "@/lib/lang";
import { AVAILABLE_MODES, useMode } from "@/lib/mode";
import { serviceOpen } from "@/lib/transit";
import { fromInput, toInput, useWhen } from "@/lib/when";

/** Walk / Bike / Car / Metro-Train picker. Times everywhere on the site follow this choice. */
export default function ModeBar({ note = true }: { note?: boolean }) {
  const { lang } = useLang();
  const { mode, setMode } = useMode();
  const { at, setAt } = useWhen();
  return (
    <div style={{ marginTop: 12 }}>
      <div className="chips" role="group" aria-label={lang === "bn" ? "যাতায়াতের মাধ্যম" : "How are you travelling?"} style={{ marginTop: 0 }}>
        {AVAILABLE_MODES.map((m) => (
          <button key={m.id} className="chip" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.icon} {lang === "bn" ? m.bn : m.en}</button>
        ))}
      </div>
      {mode === "metro" && (
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted small">🕒 {lang === "bn" ? "রওনা:" : "Leaving:"}</span>
          <button className="chip" aria-pressed={at === null} onClick={() => setAt(null)}>{lang === "bn" ? "এখন" : "Now"}</button>
          <input type="datetime-local" aria-label={lang === "bn" ? "রওনার সময় (কলকাতার সময়)" : "Leaving time (Kolkata time)"} value={at === null ? "" : toInput(at)}
            onChange={(e) => setAt(fromInput(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--line, #8886)", background: "transparent", color: "inherit", font: "inherit" }} />
        </div>
      )}
      {mode === "metro" && !serviceOpen(at ?? undefined) && (
        <p className="msg" style={{ margin: "8px 0 0" }}>
          {lang === "bn" ? "এই সময়ে মেট্রো ও ট্রেন চলছে না, তাই হাঁটার পথ দেখানো হচ্ছে। অন্য সময় বেছে নিন।" : "No metro or trains run at this time, so walking is shown. Try another time."}
        </p>
      )}
      {note && mode === "metro" && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          {lang === "bn"
            ? "মেট্রো / ট্রেনের সময় = স্টেশনে হাঁটা + যাত্রা (দরকারে ট্রেন থেকে মেট্রোতে বদল) + স্টেশন থেকে হাঁটা। যাত্রার সময় আন্দাজমাত্র; অপেক্ষার সময় ধরা হয়েছে ট্রেনের মধ্যবর্তী ব্যবধানের অর্ধেক, আর কোন লাইন কখন চলে তা data/service.json থেকে নেওয়া। পুজোর সময়সূচি বদলাতে পারে, মেট্রো রেল ও রেলের বিজ্ঞপ্তি দেখে নিন।"
            : "Metro / Train time = walk to the station + ride (changing between train and metro if that is quicker) + walk from the station. Times are estimates: the wait is half the gap between trains, and which lines run when comes from the timetable file, not live data. Puja timings can change, so check Kolkata Metro and Indian Railways notices."}
        </p>
      )}
      {note && (mode === "bike" || mode === "car") && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          {lang === "bn"
            ? "সময় আন্দাজমাত্র। পুজোর রাতে ভিড় ও রাস্তা বন্ধ থাকলে অনেক বেশি লাগতে পারে। প্যান্ডেলের কাছাকাছি গাড়ি ঢোকা বন্ধ থাকে, তাই একটু আগে নেমে হাঁটুন।"
            : "Times are estimates. Crowds and closed roads on puja nights can make them much longer. Many roads near pandals are closed to vehicles, so plan to park or get off a little early and walk the last part."}
        </p>
      )}
    </div>
  );
}
