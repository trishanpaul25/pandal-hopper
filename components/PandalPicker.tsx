"use client";
import { useMemo, useState } from "react";
import { NAVIGABLE } from "@/lib/data";
import { useLang } from "@/lib/lang";
import { tx } from "@/lib/i18n";

// Lower-cased search text, built once.
const INDEX = NAVIGABLE.map((p) => ({ p, s: `${p.name} ${p.name_bn ?? ""} ${p.area ?? ""}`.toLowerCase() }));

/** Type-to-search pandal chooser. Works on phones, unlike a 700-item dropdown. */
export default function PandalPicker({ onPick }: { onPick: (id: string) => void }) {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const res = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    return INDEX.filter((x) => x.s.includes(t)).slice(0, 8).map((x) => x.p);
  }, [q]);
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <input className="search" type="text" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
        placeholder={tx(lang, "pickStart")} aria-label={tx(lang, "pickStart")} value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && (res.length === 0
        ? <p className="muted small" style={{ margin: "6px 2px 0" }}>{tx(lang, "noMatch")}</p>
        : <ul className="pick">{res.map((p) => (
            <li key={p.id}><button onClick={() => { onPick(p.id); setQ(""); }}>
              {(lang === "bn" && p.name_bn) || p.name}{p.area && <small>{p.area}</small>}
            </button></li>))}</ul>)}
    </div>
  );
}
