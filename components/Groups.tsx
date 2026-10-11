"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAVIGABLE as PANDALS } from "@/lib/data";
import type { Pandal, Place, Point } from "@/lib/types";
import { fmtDist, meters, walkRoute, type WalkRoute } from "@/lib/geo";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { useSeen } from "@/lib/store";
import { useStored } from "@/lib/useStored";
import {
  MAX_MEMBERS, cleanCode, cleanNick, createGroup, joinGroup, leaveGroup, setNick, watchMembers, watchMyGroups,
  type Group, type Member,
} from "@/lib/groups";
import { SHARE_HOURS, useLiveShare } from "@/lib/liveShare";
import type { Friend } from "./Map";

const Map = dynamic(() => import("./Map"), { ssr: false });

// Constants so the map does not redraw on every render.
const NO_LINE: Point[] = [], NO_PLACES: Place[] = [], NO_PANDALS: Pandal[] = [], NOOP = () => {};
const STALE_MS = 4 * 60_000;         // older than this: shown greyed out with "last seen"
const GONE_MS = 60 * 60_000;         // older than this: not shown on the map at all
const FAR_M = 300;                   // "far from you" tag

function Avatar({ m }: { m: { nick: string; photo: string } }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="avatar" aria-hidden>
      {m.photo.startsWith("https://") && !bad
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={m.photo} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} />
        : (m.nick[0] || "?").toUpperCase()}
    </span>
  );
}

export default function Groups() {
  const { user, loading, configured, signIn } = useAuth();
  const { lang } = useLang();
  const bn = lang === "bn";
  const t = (en: string, b: string) => (bn ? b : en);
  const [seen] = useSeen();

  const [nickRaw, setNickRaw] = useStored<string>("ph-nick", "");
  const nick = cleanNick(nickRaw || user?.displayName?.split(" ")[0] || "");
  const [active, setActive] = useStored<string>("ph-group-active", "");

  const [groups, setGroups] = useState<Group[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPandals, setShowPandals] = useState(false);       // the group map starts clean: only people
  const [followId, setFollowId] = useState("");                // friend I am getting directions to
  const [route, setRoute] = useState<WalkRoute | null>(null);

  const { isOn, start, stop, me, geoErr, keepAwake, setKeepAwake, setLocalTrack } = useLiveShare(); // sharing keeps running on other pages too
  const [now, setNow] = useState(() => Date.now());
  const [focus, setFocus] = useState<{ pts: Point[]; k: number } | null>(null);
  const focusK = useRef(0);
  const fittedFor = useRef("");

  const g = groups?.find((x) => x.code === active) ?? null;
  const uid = user?.uid ?? "";
  const sharing = !!active && isOn(active);

  const fail = (e: unknown) => {
    const c = (e as { code?: string; message?: string });
    if (c.message === "not-found") return t("No group with that code. Check the 6 letters and try again.", "এই কোডে কোনো দল নেই। ৬টি অক্ষর আবার দেখুন।");
    if (c.message === "full") return t(`This group is full (${MAX_MEMBERS} people).`, `দলটি ভর্তি (${MAX_MEMBERS} জন)।`);
    if (c.code === "permission-denied") return t("Groups aren't switched on for this app yet (database rules). Please try again later.", "এই অ্যাপে দল এখনও চালু হয়নি। পরে চেষ্টা করুন।");
    return t("Something went wrong. Check your internet and try again.", "কিছু একটা ভুল হয়েছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।");
  };

  // Clock for "last seen" labels and the sharing timer.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);

  // An invite link (/groups?join=CODE) fills in the code box.
  useEffect(() => {
    const c = cleanCode(new URLSearchParams(window.location.search).get("join") ?? "");
    if (c) { setJoinCode(c); setActive(""); history.replaceState(null, "", "/groups"); }
  }, []); // eslint-disable-line

  // My groups, live.
  useEffect(() => {
    if (!uid) { setGroups(null); return; }
    return watchMyGroups(uid, setGroups, () => setErr(t("Couldn't load your groups.", "দল লোড করা যায়নি।")));
  }, [uid]); // eslint-disable-line
  useEffect(() => { if (active && groups && !groups.some((x) => x.code === active)) setActive(""); }, [groups, active]); // eslint-disable-line

  // Members of the open group, live.
  useEffect(() => { setMembers([]); fittedFor.current = ""; setFollowId(""); }, [uid, active]);
  // Stop listening when this page has been hidden for 30 s (every update delivered to a listener is a billed read); resume when it is shown again.
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => { if (t) clearTimeout(t); t = null; if (document.visibilityState === "hidden") t = setTimeout(() => setAwake(false), 30_000); else setAwake(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); if (t) clearTimeout(t); };
  }, []);
  useEffect(() => {
    if (!uid || !active || !awake) return;
    return watchMembers(active, setMembers, () => {});
  }, [uid, active, awake]);

  // Friends on the map: everyone else who is sharing and was heard from in the last hour.
  const friends: Friend[] = useMemo(() => members
    .filter((m) => m.uid !== uid && m.sharing && typeof m.lat === "number" && typeof m.lng === "number" && (!m.at || now - m.at < GONE_MS))
    .map((m) => ({ id: m.uid, nick: m.nick, photo: m.photo, lat: m.lat as number, lng: m.lng as number, stale: !!m.at && now - m.at > STALE_MS })),
  [members, uid, now]);

  const fly = (pts: Point[]) => { if (pts.length) setFocus({ pts, k: ++focusK.current }); };
  // Zoom to the group once when it first has someone to show.
  useEffect(() => {
    if (!active || fittedFor.current === active) return;
    const pts: Point[] = [...friends, ...(me ? [me] : [])];
    if (pts.length) { fittedFor.current = active; fly(pts); }
  }, [friends, me, active]); // eslint-disable-line

  // Directions to a friend, drawn on this map. Both of us move, so the path is re-made every few seconds
  // (only when one of us moved 30 m or more) and its two ends are always pinned to our latest positions.
  const target = followId ? friends.find((f) => f.id === followId) ?? null : null;
  const followNick = members.find((m) => m.uid === followId)?.nick ?? "";
  const posRef = useRef<{ a: Point | null; b: Point | null }>({ a: null, b: null });
  posRef.current = { a: me ? { lat: me.lat, lng: me.lng } : null, b: target ? { lat: target.lat, lng: target.lng } : null };
  useEffect(() => { setLocalTrack(!!followId); return () => setLocalTrack(false); }, [followId]); // eslint-disable-line
  useEffect(() => {
    if (!followId) { setRoute(null); return; }
    let alive = true, busy = false, last: { a: Point; b: Point } | null = null;
    const tick = async () => {
      const { a, b } = posRef.current;
      if (!a || !b || busy) return;
      if (last && meters(last.a, a) < 30 && meters(last.b, b) < 30) return;
      busy = true; last = { a, b };
      const r = await walkRoute(a, b);
      busy = false; if (alive) setRoute(r);
    };
    tick(); const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [followId]);
  useEffect(() => { if (!target) setRoute(null); }, [!!target]); // eslint-disable-line
  const line: Point[] = useMemo(() => {
    if (!me || !target) return NO_LINE;
    const b = { lat: target.lat, lng: target.lng };
    return [{ lat: me.lat, lng: me.lng }, ...(route && !route.approx ? route.coords : []), b];
  }, [me, target, route]);
  const toFriend = me && target ? meters(me, target) : null;

  const ago = (ms: number) => {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return t("just now", "এইমাত্র");
    const m = Math.round(s / 60); if (m < 60) return t(`${m} min ago`, `${m} মিনিট আগে`);
    const h = Math.round(m / 60); return t(`${h} h ago`, `${h} ঘণ্টা আগে`);
  };
  const rows = useMemo(() => {
    const dist = (m: Member) => (me && typeof m.lat === "number" && typeof m.lng === "number" ? meters(me, { lat: m.lat, lng: m.lng }) : null);
    const live = (m: Member) => m.sharing && typeof m.lat === "number" && (!m.at || now - m.at < GONE_MS);
    return members.map((m) => ({ m, d: m.uid === uid ? null : dist(m), live: live(m) }))
      .sort((a, b) => (a.m.uid === uid ? -1 : b.m.uid === uid ? 1 : 0) || Number(b.live) - Number(a.live) || (a.d ?? 1e9) - (b.d ?? 1e9) || a.m.nick.localeCompare(b.m.nick));
  }, [members, me, uid, now]);

  // ---- actions ----
  const doCreate = async () => {
    if (!user || busy) return; setBusy(true); setErr("");
    try { const c = await createGroup(user, newName, nick); setNewName(""); setActive(c); } catch (e) { setErr(fail(e)); }
    setBusy(false);
  };
  const doJoin = async () => {
    if (!user || busy) return;
    if (cleanCode(joinCode).length !== 6) return setErr(t("A group code has 6 letters or numbers.", "দলের কোডে ৬টি অক্ষর বা সংখ্যা থাকে।"));
    setBusy(true); setErr("");
    try { const c = await joinGroup(user, cleanCode(joinCode), nick); setJoinCode(""); setActive(c); } catch (e) { setErr(fail(e)); }
    setBusy(false);
  };
  const doLeave = async () => {
    if (!user || !g) return;
    if (!confirm(t(`Leave "${g.name}"? Your location will stop being shared with this group.`, `"${g.name}" ছেড়ে যাবেন? এই দলে আপনার লোকেশন আর দেখা যাবে না।`))) return;
    stop(g.code);
    try { await leaveGroup(user, g.code); setActive(""); } catch (e) { setErr(fail(e)); }
  };

  const link = typeof window === "undefined" || !g ? "" : `${window.location.origin}/groups?join=${g.code}`;
  const inviteText = g ? t(
    `Join my group "${g.name}" on Pandal Hopper so we can see each other on the map while pandal hopping. Code: ${g.code}\n${link}`,
    `Pandal Hopper-এ আমাদের "${g.name}" দলে যোগ দিন, ঠাকুর দেখতে গিয়ে মানচিত্রে একে অন্যকে দেখা যাবে। কোড: ${g.code}\n${link}`) : "";
  const copy = async () => { if (!g) return; try { await navigator.clipboard.writeText(g.code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} };
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  // ---- screens ----
  const head = (title: string, eyebrow: string) => (<><span className="eyebrow">{eyebrow}</span><h1 className="h1" style={{ fontSize: "clamp(26px,5vw,38px)", marginBottom: 14 }}>{title}</h1></>);

  if (!configured) return <div className="page">{head(t("Groups", "দল"), t("Hop together", "একসাথে ঘুরুন"))}<div className="empty">{t("Groups need sign-in, which isn't set up yet. Add your Firebase keys to .env.local.", "দল ব্যবহার করতে সাইন ইন লাগে, যা এখনও সেট আপ হয়নি।")}</div></div>;
  if (loading) return <div className="page"><p className="muted">…</p></div>;
  if (!user) return (
    <div className="page">
      {head(t("Hop together", "একসাথে ঘুরুন"), t("Groups", "দল"))}
      <div className="card paar" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <p style={{ margin: 0 }}>{t("Make a group with your friends or family, share one code, and see each other on the map while hopping, so nobody gets left behind.", "বন্ধু বা পরিবারের সাথে একটি দল বানান, একটি কোড শেয়ার করুন, আর ঘোরার সময় মানচিত্রে একে অন্যকে দেখুন। কেউ আর পিছিয়ে পড়বে না।")}</p>
        <button className="btn primary big" onClick={signIn}>{t("Sign in with Google to start", "শুরু করতে গুগল দিয়ে সাইন ইন করুন")}</button>
        <p className="muted small" style={{ margin: 0 }}>{t("Your location is shared only with people in your group, only while you switch sharing on.", "আপনার লোকেশন শুধু আপনার দলের সদস্যরা দেখবে, এবং শুধু যখন আপনি শেয়ারিং চালু রাখবেন।")} <Link href="/login" style={{ color: "var(--alta)", fontWeight: 600 }}>{t("Account page", "অ্যাকাউন্ট পেজ")}</Link></p>
      </div>
    </div>
  );

  // One group open
  if (g) return (
    <div className="page">
      <button className="btn outline sm" onClick={() => setActive("")} style={{ marginBottom: 10 }}>← {t("All groups", "সব দল")}</button>
      {head(g.name, t("Group · see everyone", "দল · সবাইকে দেখুন"))}

      <div className="mapbox">
        <Map pandals={showPandals ? PANDALS : NO_PANDALS} places={NO_PLACES} seen={seen} you={me} heading={me?.heading ?? 0}
          line={line} lineColor="#0077b6" solid showPlaces={false} onPick={NOOP} friends={friends} focus={focus} fitKey={followId || null} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn outline sm" onClick={() => fly([...friends, ...(me ? [me] : [])])} disabled={!friends.length && !me}>👥 {t("Show everyone", "সবাইকে দেখান")}</button>
        {me && <button className="btn outline sm" onClick={() => fly([me])}>📍 {t("Me", "আমি")}</button>}
        <label className="row" style={{ gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showPandals} onChange={(e) => setShowPandals(e.target.checked)} />
          <span className="small">{t("Show pandals", "প্যান্ডেল দেখান")}</span>
        </label>
      </div>

      {followId && (
        <div className="card paar" style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <b>🧭 {t(`Walking to ${followNick || "friend"}`, `${followNick || "বন্ধু"}-এর কাছে যাচ্ছেন`)}</b>
          {!target ? <span className="msg" style={{ margin: 0 }}>{t(`${followNick || "They"} isn't sharing right now. The path will come back when they do.`, `${followNick || "তিনি"} এখন শেয়ার করছেন না। শেয়ার করলে পথ আবার দেখা যাবে।`)}</span>
            : !me ? <span className="muted">{t("Finding your location…", "আপনার লোকেশন খোঁজা হচ্ছে…")}</span>
            : toFriend !== null && toFriend < 25 ? <span>✅ {t("You've reached them!", "আপনি পৌঁছে গেছেন!")}</span>
            : <span><b>{fmtDist((toFriend ?? 0) / 1000)}</b> {t("away", "দূরে")}{route ? <> · ~{route.mins} {t("min walk", "মিনিটের হাঁটা")}{route.approx ? t(" (straight line)", " (সোজা দূরত্ব)") : ""}</> : null}</span>}
          <span className="muted small">{t("The blue path updates as you or they move. Your location is used on this phone only, unless you turned sharing on.", "আপনি বা তিনি নড়লে নীল পথ নিজে থেকেই বদলায়। আপনার লোকেশন শুধু এই ফোনে ব্যবহার হয়, শেয়ারিং চালু না থাকলে কাউকে পাঠানো হয় না।")}</span>
          {geoErr && <span className="msg" style={{ margin: 0 }}>{geoErr}</span>}
          <div><button className="btn outline sm" onClick={() => setFollowId("")}>{t("Stop directions", "দিকনির্দেশ বন্ধ")}</button></div>
        </div>
      )}

      <div className="card paar" style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <button className="switch" role="switch" aria-checked={sharing} onClick={() => (sharing ? stop(g.code) : start(g.code))}>
          <i aria-hidden />
          <span>{sharing ? t("Sharing my live location", "আমার লাইভ লোকেশন শেয়ার হচ্ছে") : t("Share my live location with this group", "এই দলের সাথে আমার লাইভ লোকেশন শেয়ার করুন")}</span>
        </button>
        <p className="muted small" style={{ margin: 0 }}>
          {sharing
            ? t(`Only this group can see you. It switches off by itself after ${SHARE_HOURS} hours, or when you turn it off (your last spot is then deleted). Keep this page open: phones pause location when the screen locks.`,
                `শুধু এই দলের সদস্যরা আপনাকে দেখতে পাবে। ${SHARE_HOURS} ঘণ্টা পর বা আপনি বন্ধ করলে নিজে থেকেই বন্ধ হবে (তখন শেষ লোকেশন মুছে যায়)। পেজটি খোলা রাখুন: স্ক্রিন লক হলে ফোন লোকেশন থামিয়ে দেয়।`)
            : t("Turn this on to appear on your friends' maps and see how far they are. Nobody sees you until you do.", "চালু করলে বন্ধুদের মানচিত্রে আপনি দেখা যাবেন এবং তারা কত দূরে বুঝতে পারবেন। চালু না করা পর্যন্ত কেউ আপনাকে দেখতে পাবে না।")}
        </p>
        {sharing && (
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
            <span className="small">{t("Keep my screen awake while sharing (uses more battery)", "শেয়ারের সময় স্ক্রিন জাগিয়ে রাখুন (ব্যাটারি বেশি লাগে)")}</span>
          </label>
        )}
        {geoErr && <p className="msg" style={{ margin: 0 }}>{geoErr}</p>}
      </div>

      <h2 className="h2" style={{ fontSize: 22, margin: "22px 0 6px" }}>{t(`Members (${members.length})`, `সদস্য (${members.length})`)}</h2>
      <div className="card" style={{ padding: "4px 16px" }}>
        {rows.map(({ m, d, live }) => {
          const isMe = m.uid === uid, stale = live && !!m.at && now - m.at > STALE_MS;
          return (
            <div key={m.uid} className={"mem" + (live || isMe ? "" : " off")}>
              <Avatar m={m} />
              <div className="mem-main">
                <b>{m.nick}{isMe ? t(" (you)", " (আপনি)") : ""}</b>
                <span className="muted small">
                  {isMe ? (sharing ? t("Sharing", "শেয়ার হচ্ছে") : t("Not sharing", "শেয়ার বন্ধ"))
                    : !live ? t("Not sharing", "শেয়ার বন্ধ")
                    : [d !== null ? `${fmtDist(d / 1000)} ${t("away", "দূরে")}` : "", stale ? t(`last seen ${ago(m.at)}`, `শেষ দেখা ${ago(m.at)}`) : t("live", "লাইভ")].filter(Boolean).join(" · ")}
                </span>
                {live && !isMe && d !== null && d > FAR_M && !stale && <span className="chip" style={{ marginLeft: 8, minHeight: 0, padding: "2px 10px", fontSize: 12 }}>{t("far from you", "আপনার থেকে দূরে")}</span>}
              </div>
              {live && !isMe && <>
                <button className="iconbtn" onClick={() => fly([{ lat: m.lat as number, lng: m.lng as number }])} aria-label={t("Show on map", "মানচিত্রে দেখান")}>📍</button>
                <button className={"iconbtn" + (followId === m.uid ? " solid" : "")} aria-pressed={followId === m.uid}
                  aria-label={t("Directions to them", "তার কাছে যাওয়ার পথ")}
                  onClick={() => { setFollowId(followId === m.uid ? "" : m.uid); if (followId !== m.uid) setShowPandals(false); }}>🧭</button>
              </>}
            </div>
          );
        })}
        {!members.length && <p className="muted small">…</p>}
      </div>

      <h2 className="h2" style={{ fontSize: 22, margin: "22px 0 6px" }}>{t("Invite people", "বন্ধুদের ডাকুন")}</h2>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div><span className="gcode" aria-label={t("Group code", "দলের কোড")}>{g.code}</span></div>
        <div className="row">
          <a className="btn primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`}>{t("Send on WhatsApp", "WhatsApp-এ পাঠান")}</a>
          <button className="btn outline" onClick={copy}>{copied ? t("Copied ✓", "কপি হয়েছে ✓") : t("Copy code", "কোড কপি")}</button>
          {canShare && <button className="btn outline" onClick={() => navigator.share({ text: inviteText }).catch(() => {})}>{t("Share…", "শেয়ার…")}</button>}
        </div>
        <p className="muted small" style={{ margin: 0 }}>{t(`Anyone with this code can join (up to ${MAX_MEMBERS} people), so share it only with your group.`, `এই কোড যার কাছে আছে সে-ই যোগ দিতে পারবে (সর্বোচ্চ ${MAX_MEMBERS} জন), তাই শুধু নিজের দলকে দিন।`)}</p>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="small muted">{t("Your name in this group", "এই দলে আপনার নাম")}</span>
          <input className="search" value={nickRaw} placeholder={nick} maxLength={24} onChange={(e) => setNickRaw(e.target.value)}
            onBlur={() => { const n = cleanNick(nickRaw) || nick; setNickRaw(n); setNick(g.code, uid, n); }} />
        </label>
      </div>
      {err && <p className="msg">{err}</p>}
      <div style={{ marginTop: 18 }}><button className="btn outline sm" onClick={doLeave}>{t("Leave this group", "দল ছাড়ুন")}</button></div>
    </div>
  );

  // Group list + create / join
  return (
    <div className="page">
      {head(t("Hop together", "একসাথে ঘুরুন"), t("Groups", "দল"))}
      <p className="muted" style={{ maxWidth: 620, marginTop: 0 }}>{t("Friends and family get split up in the crowd. Put everyone in a group and see each other on the map.", "ভিড়ে বন্ধু ও পরিবার আলাদা হয়ে যায়। সবাইকে একটি দলে রাখুন, মানচিত্রে একে অন্যকে দেখুন।")}</p>

      <label style={{ display: "grid", gap: 6, maxWidth: 360, margin: "14px 0" }}>
        <span className="small muted">{t("Your name (friends see this on the map)", "আপনার নাম (বন্ধুরা মানচিত্রে এটি দেখবে)")}</span>
        <input className="search" value={nickRaw} placeholder={nick} maxLength={24} onChange={(e) => setNickRaw(e.target.value)} />
      </label>

      {!!groups?.length && (<>
        <h2 className="h2" style={{ fontSize: 22, margin: "18px 0 8px" }}>{t("Your groups", "আপনার দল")}</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          {groups.map((x) => (
            <button key={x.code} className="card paar" style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setActive(x.code)}>
              <b style={{ fontSize: 18 }}>{x.name}</b><br />
              <span className="muted small">{t(`${x.memberIds.length} members · code ${x.code}`, `${x.memberIds.length} জন · কোড ${x.code}`)}</span>
            </button>
          ))}
        </div>
      </>)}

      <div style={{ display: "grid", gap: 14, maxWidth: 560, marginTop: 20 }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ fontSize: 19, margin: 0 }}>{t("Join with a code", "কোড দিয়ে যোগ দিন")}</h3>
          <input className="search" placeholder="ABC123" value={joinCode} onChange={(e) => setJoinCode(cleanCode(e.target.value))} autoCapitalize="characters" autoComplete="off"
            style={{ letterSpacing: ".2em", fontWeight: 700 }} onKeyDown={(e) => e.key === "Enter" && doJoin()} />
          <button className="btn primary" onClick={doJoin} disabled={busy || joinCode.length !== 6}>{t("Join group", "দলে যোগ দিন")}</button>
        </div>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ fontSize: 19, margin: 0 }}>{t("Create a group", "নতুন দল বানান")}</h3>
          <input className="search" placeholder={t("Group name, e.g. Sasthi with the gang", "দলের নাম, যেমন: বন্ধুদের পুজো")} value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doCreate()} />
          <button className="btn primary" onClick={doCreate} disabled={busy || !newName.trim()}>{t("Create and get code", "বানান ও কোড নিন")}</button>
        </div>
      </div>
      {err && <p className="msg">{err}</p>}
    </div>
  );
}
