"use client";
import { useRef, useState } from "react";
import { byId } from "@/lib/data";
import { useLang } from "@/lib/lang";
import { useTrails } from "@/lib/trails";
import type { Route } from "@/lib/types";

const short = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** "Add to trail" for a pre-built circuit: puts all its stops in the trail you are using, or starts a new trail from it. */
export default function AddCircuit({ route }: { route: Route }) {
  const { lang } = useLang();
  const bn = lang === "bn";
  const t = useTrails();
  const [msg, setMsg] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (text: string, undo?: () => void) => {
    setMsg({ text, undo });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 6000);
  };
  const ids = route.ids.filter((i) => byId[i] && byId[i].precision !== "approx");   // only stops with a real pin

  const add = () => {
    const before = t.active.ids, tid = t.active.id, name = t.active.name;
    const n = t.addIds(ids);
    const had = ids.length - n;
    say(n === 0
      ? (bn ? `সবগুলো স্টপ “${name}”-এ আগেই আছে` : `All ${ids.length} stops are already in “${name}”`)
      : (bn ? `${n}টি স্টপ “${name}”-এ যোগ হয়েছে${had ? ` (${had}টি আগেই ছিল)` : ""}` : `Added ${n} stop${n === 1 ? "" : "s"} to “${name}”${had ? ` (${had} already there)` : ""}`),
      n ? () => t.restore(tid, before) : undefined);
  };
  const fresh = () => {
    const id = t.create(route.name, ids);
    if (!id) { say(bn ? "ট্রেইলের সীমা শেষ। একটি মুছে আবার চেষ্টা করুন।" : "Trail limit reached. Delete one and try again."); return; }
    say(bn ? `নতুন ট্রেইল “${route.name}” শুরু হয়েছে` : `Started a new trail “${route.name}”`);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="btn sm gold" onClick={add} disabled={!ids.length}>＋ {bn ? "ট্রেইলে যোগ" : "Add to trail"}<span style={{ opacity: 0.75, fontWeight: 500 }}> · {short(t.active.name)}</span></button>
        <button className="btn sm outline" onClick={fresh} disabled={!ids.length}>{bn ? "নতুন ট্রেইল" : "New trail from this"}</button>
      </div>
      {msg && <p className="msg" role="status" style={{ margin: "8px 0 0" }}>{msg.text}{msg.undo && <> <button className="btn sm" onClick={() => { msg.undo?.(); setMsg(null); }}>{bn ? "ফেরান" : "Undo"}</button></>}</p>}
    </div>
  );
}
