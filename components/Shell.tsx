"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/lang";
import { useTheme } from "@/lib/theme";
import { D, tx, K } from "@/lib/i18n";
import { Logo } from "./Art";
import AuthButton from "./AuthButton";
import Onboarding from "./Onboarding";
import InstallButton from "./InstallButton";
import ShareBar from "./ShareBar";

const DESK: { href: string; k: K }[] = [
  { href: "/", k: "home" }, { href: "/hop", k: "hop" }, { href: "/pandals", k: "pandals" }, { href: "/days", k: "days" },
  { href: "/groups", k: "groups" }, { href: "/food", k: "food" }, { href: "/guide", k: "guide" }, { href: "/saved", k: "saved" },
];
const MOB: { href: string; k: K; icon: string }[] = [
  { href: "/", k: "home", icon: "🏮" }, { href: "/hop", k: "hop", icon: "📍" }, { href: "/pandals", k: "pandals", icon: "🛕" },
  { href: "/days", k: "days", icon: "📅" }, { href: "/groups", k: "groups", icon: "👥" }, { href: "/food", k: "food", icon: "🍛" },
  { href: "/guide", k: "guide", icon: "🆘" },
];
// Seven tabs share the width of a phone, so a few labels get a shorter form here.
const SHORT: Partial<Record<K, { en: string; bn: string }>> = { food: { en: "Food", bn: "খাবার" } };
const mobLabel = (k: K, l: "en" | "bn") => (SHORT[k] ?? D[k])[l];

const creditLink = { color: "var(--alta)", fontWeight: 600 } as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const { lang, setLang } = useLang();
  const { theme, toggle } = useTheme();
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <div className="weave" aria-hidden />
      <header className="topbar">
        <div className="topin">
          <Link href="/" className="brand"><Logo size={32} />{lang === "bn" ? "প্যান্ডেল হপার" : "Pandal Hopper"}</Link>
          <nav className="dnav" aria-label="Main">
            {DESK.map((n) => <Link key={n.href} href={n.href} aria-current={on(n.href) ? "page" : undefined}>{D[n.k][lang].replace(" & Sights", "")}</Link>)}
          </nav>
          <div className="seg" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাং</button>
          </div>
          <button className="iconbtn" onClick={toggle} aria-pressed={theme === "dark"}>
            {theme === "dark" ? "☀️" : "🌙"}<span className="hide-s">{theme === "dark" ? tx(lang, "day") : tx(lang, "night")}</span>
          </button>
          <AuthButton />
          <InstallButton />
          <Link href="/saved" className="iconbtn solid" aria-label={tx(lang, "saved")}>★</Link>
        </div>
      </header>
      <ShareBar />
      {children}
      <footer className="foot">
        <p><b>Emergency:</b> 112 (all services) · Police 100 · Ambulance 102 · Women helpline 1091</p>
        <p>Independent guide. Check each club's own announcements for timings.</p>
        <p><button className="tour-link" onClick={() => window.dispatchEvent(new Event("ph-open-tour"))}>{lang === "bn" ? "কীভাবে ব্যবহার করবেন" : "How to use this site"}</button></p>
        <p className="credit">
          Built by <b>Trishan Paul</b> ·{" "}
          <a href="https://www.linkedin.com/in/trishan-paul-0497b428b/" target="_blank" rel="noopener noreferrer" style={creditLink}>LinkedIn</a> ·{" "}
          <a href="mailto:trishanpaul25@gmail.com" style={creditLink}>trishanpaul25@gmail.com</a>
        </p>
      </footer>
      <nav className="bnav" aria-label="Main">
        {MOB.map((n) => (
          <Link key={n.href} href={n.href} aria-current={on(n.href) ? "page" : undefined}>
            <b aria-hidden>{n.icon}</b>{mobLabel(n.k, lang)}<small>{mobLabel(n.k, lang === "en" ? "bn" : "en")}</small>
          </Link>
        ))}
      </nav>
      <Onboarding />
    </>
  );
}
