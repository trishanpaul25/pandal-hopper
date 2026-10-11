"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang";
import "./Onboarding.css";

const KEY = "ph-tour-done";   // set once the first-time tour has been closed
type T = { en: string; bn: string };
const SLIDES: { icon: string; title: T; body: T; tip: T }[] = [
  { icon: "🪔",
    title: { en: "Welcome to Pandal Hopper", bn: "প্যান্ডেল হপারে স্বাগতম" },
    body: { en: "Visit Durga Puja pandals in Kolkata without the confusion. This quick tour shows you how, in about a minute.", bn: "কলকাতার দুর্গাপুজোর প্যান্ডেল ঘুরুন কোনও গোলমাল ছাড়াই। এক মিনিটে দেখে নিন কীভাবে।" },
    tip: { en: "You can skip this at any time.", bn: "চাইলে যেকোনও সময় বন্ধ করতে পারেন।" } },
  { icon: "📍",
    title: { en: "Tell us where you are", bn: "আপনি কোথায় আছেন জানান" },
    body: { en: "Open the Hop page. Tap “Use my location”, or search for the pandal you are standing at.", bn: "‘রুট’ পেজ খুলুন। ‘আমার লোকেশন’ চাপুন, অথবা যে প্যান্ডেলে আছেন সেটি খুঁজে নিন।" },
    tip: { en: "Your location stays on your phone.", bn: "আপনার লোকেশন আপনার ফোনেই থাকে।" } },
  { icon: "🧭",
    title: { en: "Follow the nearest pandal", bn: "সবচেয়ে কাছের প্যান্ডেল ধরুন" },
    body: { en: "You will see the closest pandals you haven't visited, with the walking time. Tap “Go” to see the walking route.", bn: "যে কাছের প্যান্ডেলগুলি এখনও দেখেননি সেগুলি হাঁটার সময়সহ দেখাবে। ‘যান’ চাপলে হাঁটার রুট দেখা যাবে।" },
    tip: { en: "Get within 50 m and it is marked as seen for you. Or tap “Mark seen” yourself.", bn: "৫০ মিটারের মধ্যে পৌঁছলে নিজে থেকেই দেখা চিহ্নিত হবে। অথবা নিজে ‘দেখা হয়েছে’ চাপুন।" } },
  { icon: "⭐",
    title: { en: "Build your trail", bn: "নিজের ট্রেইল বানান" },
    body: { en: "Tap the ☆ on any pandal to add it to My Trail. Then press “Trail Go” and the app takes you through your stops in the best order.", bn: "যেকোনও প্যান্ডেলের ☆ চাপলে সেটি ‘আমার ট্রেইলে’ যোগ হবে। তারপর ‘ট্রেইলে যান’ চাপলে সবচেয়ে ভালো ক্রমে স্টপগুলি দেখাবে।" },
    tip: { en: "Added by mistake? Tap “Undo” in the pop-up.", bn: "ভুল করে যোগ করেছেন? পপ-আপে ‘ফেরান’ চাপুন।" } },
  { icon: "🍛",
    title: { en: "Eat and explore", bn: "খান আর ঘুরুন" },
    body: { en: "The Food page shows places to eat near you. The Days page tells you what happens each day, and the Guide page has safety tips.", bn: "‘খাওয়া-দাওয়া’ পেজে কাছের খাবারের জায়গা পাবেন। ‘দিনপঞ্জি’তে প্রতিদিনের তথ্য, আর ‘সহায়িকা’য় নিরাপত্তার টিপস।" },
    tip: { en: "In an emergency, call 112.", bn: "জরুরি অবস্থায় ১১২ নম্বরে ফোন করুন।" } },
  { icon: "🌙",
    title: { en: "Make it yours", bn: "নিজের মতো করে নিন" },
    body: { en: "Switch between English and Bengali at the top. Turn on Night mode for late hours. Signing in with Google is optional and keeps your trail on all your devices.", bn: "উপরে ইংরেজি ও বাংলা বদলে নিন। রাতে ঘোরার জন্য নাইট মোড চালু করুন। গুগল দিয়ে সাইন ইন করা ঐচ্ছিক, এতে আপনার ট্রেইল সব ডিভাইসে পাবেন।" },
    tip: { en: "Open this tour again from the bottom of any page.", bn: "এই গাইড আবার দেখতে যেকোনও পেজের নিচে ‘কীভাবে ব্যবহার করবেন’ চাপুন।" } },
];
const UI = {
  back: { en: "Back", bn: "আগের" }, next: { en: "Next", bn: "পরের" }, skip: { en: "Skip", bn: "এড়িয়ে যান" },
  start: { en: "Start hopping", bn: "হপ শুরু করুন" }, close: { en: "Close", bn: "বন্ধ করুন" },
};

/** Shows once, the first time someone opens the site. The footer link can open it again. */
export default function Onboarding() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true); } catch { /* storage blocked: stay quiet */ }
    const again = () => { opener.current = document.activeElement as HTMLElement | null; setI(0); setOpen(true); };
    window.addEventListener("ph-open-tour", again);
    return () => window.removeEventListener("ph-open-tour", again);
  }, []);

  const finish = useCallback(() => {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
    opener.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button, a[href]")].filter((x) => !x.hasAttribute("disabled"));
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
  }, [open, finish]);

  if (!open) return null;
  const s = SLIDES[i], last = i === SLIDES.length - 1;
  return (
    <div className="tour-back" onClick={(e) => { if (e.target === e.currentTarget) finish(); }}>
      <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" ref={box}>
        <div className="tour-top">
          <span className="tour-count" aria-live="polite">{i + 1} / {SLIDES.length}</span>
          <div className="seg" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাং</button>
          </div>
          <button className="tour-x" aria-label={UI.close[lang]} onClick={finish}>✕</button>
        </div>
        <div className="tour-icon" aria-hidden>{s.icon}</div>
        <h2 id="tour-title">{s.title[lang]}</h2>
        <p className="tour-body">{s.body[lang]}</p>
        <p className="tour-tip">💡 {s.tip[lang]}</p>
        <div className="tour-dots" aria-hidden>{SLIDES.map((_, k) => <i key={k} className={k === i ? "now" : k < i ? "done" : ""} />)}</div>
        <div className="tour-actions">
          {i > 0 ? <button className="btn" onClick={() => setI(i - 1)}>{UI.back[lang]}</button>
            : <button className="btn" onClick={finish}>{UI.skip[lang]}</button>}
          {last
            ? <Link className="btn primary" href="/hop" onClick={finish} data-autofocus>{UI.start[lang]}</Link>
            : <button className="btn primary" onClick={() => setI(i + 1)} data-autofocus>{UI.next[lang]}</button>}
        </div>
      </div>
    </div>
  );
}
