"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { watchMyGroups, type Group } from "@/lib/groups";
import { ERR_EVT, shareTrail } from "@/lib/groupTrails";
import { useTrails } from "@/lib/trails";

/** On /saved. For one of my own trails: "Share with group". For a trail that is already shared: who it is shared with,
 *  that everyone in the group can edit it, and buttons to keep a private copy or stop sharing. */
export default function ShareTrail() {
  const { user, configured } = useAuth();
  const { lang } = useLang();
  const bn = lang === "bn";
  const T = useTrails();
  const a = T.active, g = a.group;
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (s: string) => { setMsg(s); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(""), 7000); };

  useEffect(() => {
    if (!open || !user) return;
    return watchMyGroups(user.uid, (gs) => { setGroups(gs); setCode((c) => (gs.some((x) => x.code === c) ? c : gs[0]?.code ?? "")); }, () => setGroups([]));
  }, [open, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const err = () => say(bn ? "শেয়ার করা ট্রেইলে বদলটি সেভ হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।" : "Couldn't save that change to the shared trail. Check your connection and try again.");
    window.addEventListener(ERR_EVT, err); return () => window.removeEventListener(ERR_EVT, err);
  }, [bn]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!configured) return null;

  async function share() {
    const target = groups?.find((x) => x.code === code);
    if (!target) return;
    setBusy(true);
    try {
      const id = await shareTrail(target.code, a.name, a.ids);
      T.setActive(id); setOpen(false);
      say(bn ? `“${a.name}” ${target.name} দলের সাথে শেয়ার হয়েছে। দলের সবাই এখন স্টপ যোগ ও বাদ দিতে পারবেন।` : `Shared “${a.name}” with ${target.name}. Everyone in the group can now add and remove stops.`);
    } catch { say(bn ? "শেয়ার করা যায়নি। আবার চেষ্টা করুন।" : "Couldn't share the trail. Please try again."); }
    finally { setBusy(false); }
  }

  if (g) {
    const manage = T.canManage(a);
    return (
      <div className="card paar" style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <p style={{ margin: 0 }}>👥 <b>{bn ? `${g.groupName} দলের সাথে শেয়ার করা` : `Shared with ${g.groupName}`}</b></p>
        <p className="muted small" style={{ margin: 0 }}>
          {bn ? "দলের যে কেউ এই ট্রেইলে স্টপ যোগ, বাদ বা নাম বদলাতে পারবেন। বদল সবার ফোনে দেখা যাবে।" : "Anyone in this group can add, remove or rename stops. Changes show up on everyone's phone."}
          {g.editedBy ? (bn ? ` শেষ বদল: ${g.editedBy}।` : ` Last edit by ${g.editedBy}.`) : ""}
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn sm outline" onClick={() => { const id = T.create(`${a.name} (copy)`, a.ids); say(id ? (bn ? "আপনার নিজের কপি তৈরি হয়েছে।" : "Saved a private copy for you. Group edits won't change it.") : (bn ? "ট্রেইলের সীমা শেষ।" : "Trail limit reached. Delete one and try again.")); }}>
            {bn ? "নিজের কপি সেভ করুন" : "Save my own copy"}
          </button>
          {manage && <button className="btn sm outline" onClick={() => { if (window.confirm(bn ? `“${a.name}” শেয়ার বন্ধ করবেন? দলের সবার কাছ থেকে এটি মুছে যাবে।` : `Stop sharing “${a.name}”? It will disappear for everyone in the group. Save your own copy first if you want to keep it.`)) T.remove(a.id); }}>
            {bn ? "শেয়ার বন্ধ করুন" : "Stop sharing"}
          </button>}
        </div>
        {msg && <p className="msg" role="status" style={{ margin: 0 }}>{msg}</p>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn sm outline" aria-expanded={open} onClick={() => setOpen(!open)}>👥 {bn ? "দলের সাথে শেয়ার করুন" : "Share with group"}</button>
      {open && <div className="card" style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {!user ? (
          <p className="muted small" style={{ margin: 0 }}>{bn ? "দলের সাথে শেয়ার করতে সাইন ইন করুন। " : "Sign in to share a trail with a group. "}<Link href="/login" style={{ color: "var(--alta)", fontWeight: 600 }}>{bn ? "সাইন ইন" : "Sign in"}</Link></p>
        ) : groups === null ? <p className="muted small" style={{ margin: 0 }}>…</p>
        : groups.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>{bn ? "আপনি এখনো কোনো দলে নেই। " : "You're not in a group yet. "}<Link href="/groups" style={{ color: "var(--alta)", fontWeight: 600 }}>{bn ? "দল বানান বা যোগ দিন" : "Create or join a group"}</Link></p>
        ) : <>
          <p className="muted small" style={{ margin: 0 }}>{bn ? `“${a.name}”-এর একটি কপি দলের সাথে শেয়ার হবে। দলের সবাই সেটিতে স্টপ যোগ ও বাদ দিতে পারবেন। আপনার নিজের ট্রেইল যেমন আছে তেমনই থাকবে।` : `A copy of “${a.name}” will be shared. Everyone in the group can add and remove stops on it. Your own trail stays as it is.`}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="search" style={{ minHeight: 40, width: "auto", maxWidth: 240 }} value={code} onChange={(e) => setCode(e.target.value)} aria-label={bn ? "দল বেছে নিন" : "Choose group"}>
              {groups.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            <button className="btn sm primary" onClick={share} disabled={busy || !code}>{busy ? "…" : (bn ? "ট্রেইল শেয়ার করুন" : "Share trail")}</button>
          </div>
        </>}
      </div>}
      {msg && <p className="msg" role="status" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}
