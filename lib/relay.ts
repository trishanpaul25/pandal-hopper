import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

/** Live positions travel through a Supabase Realtime BROADCAST channel, one channel per group (named after the group code).
 *  Broadcast messages are passed straight from phone to phone and are never stored, so they cost no Firestore reads or writes.
 *  Firestore still keeps the group, the member list, names and the "sharing" on/off flag (a handful of tiny writes per outing).
 *
 *  Messages:  "pos"   { u, la, ln, h, a }   a sharing phone says where it is
 *             "hello" { u }                 a phone that just started listening asks sharers to send their position right now,
 *                                           so people appear immediately instead of after their next scheduled send. */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const relayConfigured = !!(URL && KEY);

export type Pos = { lat: number; lng: number; heading: number | null; acc: number };
export type SeenPos = Pos & { at: number }; // `at` = when THIS phone received it (ms), so clock differences between phones don't matter
type Handlers = {
  listen?: boolean;                                // wants to see other people's positions (the Groups page)
  onPos?: (uid: string, p: SeenPos) => void;
  onHello?: () => void;                            // someone asked: send my latest position now (sharers)
};
type Entry = { ch: RealtimeChannel; ready: boolean; users: Set<Handlers>; uid: string };

let sb: SupabaseClient | null = null;
const client = () => (sb ??= createClient(URL!, KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
}));
const entries = new Map<string, Entry>();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function sendRaw(e: Entry, event: string, payload: Record<string, unknown>) {
  if (!e.ready) return; // not connected yet: the next scheduled send (or a hello reply) covers it
  e.ch.send({ type: "broadcast", event, payload }).catch(() => {});
}

/** Join a group's channel. Several parts of the app can share one channel; it closes when the last one lets go. Returns the "let go" function. */
export function openRelay(code: string, uid: string, h: Handlers): () => void {
  if (!relayConfigured || typeof window === "undefined" || !code || !uid) return () => {};
  let e = entries.get(code);
  if (!e) {
    const ch = client().channel("pg-" + code, { config: { broadcast: { self: false } } });
    const entry: Entry = { ch, ready: false, users: new Set(), uid };
    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const u = typeof payload?.u === "string" ? payload.u : "", la = num(payload?.la), ln = num(payload?.ln);
      if (!u || u === entry.uid || la === null || ln === null) return;
      const p: SeenPos = { lat: la, lng: ln, heading: num(payload?.h), acc: num(payload?.a) ?? 0, at: Date.now() };
      entry.users.forEach((x) => x.onPos?.(u, p));
    });
    ch.on("broadcast", { event: "hello" }, () => entry.users.forEach((x) => x.onHello?.()));
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        entry.ready = true;
        if ([...entry.users].some((x) => x.listen)) sendRaw(entry, "hello", { u: entry.uid });
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") entry.ready = false; // the library reconnects by itself
    });
    entries.set(code, entry); e = entry;
  }
  e.users.add(h);
  if (e.ready && h.listen) sendRaw(e, "hello", { u: e.uid }); // joined a channel that was already open
  const entry = e;
  return () => {
    entry.users.delete(h);
    if (!entry.users.size && entries.get(code) === entry) { entries.delete(code); client().removeChannel(entry.ch).catch(() => {}); }
  };
}

/** Tell the group where I am. Does nothing if that group's channel isn't open yet. */
export function sendPos(code: string, uid: string, p: Pos) {
  const e = entries.get(code);
  if (e) sendRaw(e, "pos", { u: uid, la: +p.lat.toFixed(6), ln: +p.lng.toFixed(6), h: p.heading === null ? null : Math.round(p.heading), a: Math.round(p.acc) });
}
