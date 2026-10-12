"use client";
import { useLang } from "@/lib/lang";
import { AVAILABLE_MODES, useMode } from "@/lib/mode";

/** Walk / Bike / Car / Metro-Train picker. Times everywhere on the site follow this choice. */
export default function ModeBar({ note = true }: { note?: boolean }) {
  const { lang } = useLang();
  const { mode, setMode } = useMode();
  return (
    <div style={{ marginTop: 12 }}>
      <div className="chips" role="group" aria-label={lang === "bn" ? "যাতায়াতের মাধ্যম" : "How are you travelling?"} style={{ marginTop: 0 }}>
        {AVAILABLE_MODES.map((m) => (
          <button key={m.id} className="chip" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.icon} {lang === "bn" ? m.bn : m.en}</button>
        ))}
      </div>
      {note && mode === "metro" && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          {lang === "bn"
            ? "মেট্রো / ট্রেনের সময় = স্টেশনে হাঁটা + যাত্রা (দরকারে ট্রেন থেকে মেট্রোতে বদল) + স্টেশন থেকে হাঁটা। যাত্রার সময় আন্দাজমাত্র; ট্রেনের জন্য গড়ে ১০ মিনিট অপেক্ষা ধরা হয়েছে। পুজোর সময়সূচির জন্য মেট্রো রেল ও রেলের বিজ্ঞপ্তি দেখে নিন।"
            : "Metro / Train time = walk to the station + ride (changing between train and metro if that is quicker) + walk from the station. Times are estimates, with about 10 minutes of waiting assumed for a train. Check Kolkata Metro and Indian Railways notices for Puja timings and any closed stations."}
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
