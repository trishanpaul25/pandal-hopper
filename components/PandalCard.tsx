"use client";
import Link from "next/link";
import { ReactNode } from "react";
import type { Pandal } from "@/lib/types";
import { ZONES } from "@/lib/data";
import { useLang } from "@/lib/lang";
import { tx } from "@/lib/i18n";
import { Arch } from "./Art";

type Props = {
  p: Pandal; seen: boolean; saved: boolean;
  onSeen?: () => void; onSave?: () => void; dist?: string; rank?: number;
  hopLink?: boolean; onGo?: () => void; going?: boolean; children?: ReactNode;
};

export default function PandalCard({ p, seen, saved, onSeen, onSave, dist, rank, hopLink, onGo, going, children }: Props) {
  const { lang } = useLang();
  const approx = p.precision === "approx";
  if (approx) { hopLink = false; onGo = undefined; onSave = undefined; }
  const primary = (lang === "bn" && p.name_bn) || p.name;
  const caption = lang === "bn" ? (p.name_bn ? p.name : "") : (p.name_bn ?? "");
  return (
    <article className={`pcard ${seen ? "is-seen" : ""}`}>
      <div className="pthumb">
        <Arch tone={p.zone} />
        <span className={`badge ${seen ? "seen" : "notseen"}`}>{seen ? "✓ " + tx(lang, "seen") : tx(lang, "notSeen")}</span>
        {rank && <span className="rank">#{rank}</span>}
        {dist && <span className="distpill">{dist}</span>}
        {onSave && <button className={`bookmark ${saved ? "on" : ""}`} aria-pressed={saved} aria-label={saved ? "Remove from my trail" : "Add to my trail"} onClick={onSave}>{saved ? "★" : "☆"}</button>}
      </div>
      <div className="pbody">
        <p className="zonetag">{ZONES[p.zone]?.[lang] ?? p.zone}{p.area ? ` · ${p.area}` : ""}</p>
        <h3>{primary}</h3>
        {caption && <p className="bncap">{caption}</p>}
        {p.theme && <p className="muted small">{p.theme}</p>}
        {approx && <p className="muted small" style={{ margin: "4px 0 0" }}>📍 {lang === "bn" ? "সঠিক অবস্থান এখনও নিশ্চিত নয়, তাই রুট দেখানো হচ্ছে না।" : "Exact spot not confirmed yet, so no route is shown."}</p>}
        <div className="pactions">
          {hopLink && <Link className="btn outline" href={`/hop?from=${p.id}`}>{tx(lang, "hopFrom")}</Link>}
          {onGo && <button className={`btn ${going ? "gold" : "primary"}`} onClick={onGo}>{going ? "➤ " + tx(lang, "stop") : "➤ " + tx(lang, "go")}</button>}
          {onSeen && <button className={`btn ${seen ? "gold" : "outline"}`} onClick={onSeen}>{seen ? "✕ " + tx(lang, "unmark") : "✓ " + tx(lang, "markSeen")}</button>}
        </div>
        {children}
      </div>
    </article>
  );
}
