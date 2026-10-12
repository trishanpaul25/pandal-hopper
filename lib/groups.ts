import {
  arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch,
  type Timestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

/** Data layout (Firestore):
 *  groups/{CODE}                  name, ownerId, memberIds[]      <- the 6-letter code IS the document id
 *  groups/{CODE}/members/{uid}    nick, photo, sharing
 *  Only members can read the members (see firestore.rules).
 *  Live positions are NOT stored here: they travel through the relay (lib/relay.ts), so moving around costs no reads or writes.
 *  `sharing` and `until` are written when someone switches sharing on or off.
 *  A "last known position" checkpoint (lat, lng, at) is saved rarely (every 5 min and when the app goes to the background) so late joiners and
 *  friends whose phone went to sleep still show "last seen". Stopping sharing deletes it. */
export const MAX_MEMBERS = 12; // reads grow with the square of group size, so keep groups friend/family sized
export type Group = { code: string; name: string; ownerId: string; memberIds: string[] };
export type Member = {
  uid: string; nick: string; photo: string; sharing: boolean;
  lat?: number; lng?: number; heading?: number | null; acc?: number;
  at: number; // when the position was last sent (ms). 0 if unknown.
  until?: number; // when this person's sharing switch expires on their phone (ms). Lets everyone else ignore a switch that was never turned off.
};

// No 0/O/1/I/L so a code is easy to read out loud.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const genCode = () => {
  const b = new Uint32Array(6); crypto.getRandomValues(b);
  return Array.from(b, (n) => ALPHABET[n % ALPHABET.length]).join("");
};
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
export const cleanNick = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 24);

const memberRef = (code: string, uid: string) => doc(db!, "groups", code, "members", uid);
const memberBase = (user: User, nick: string) => ({ nick: cleanNick(nick) || "Friend", photo: user.photoURL ?? "", sharing: false, joinedAt: serverTimestamp() });

export async function createGroup(user: User, name: string, nick: string): Promise<string> {
  if (!db) throw new Error("no-db");
  for (let i = 0; i < 5; i++) {
    const code = genCode(); const gref = doc(db, "groups", code);
    if ((await getDoc(gref)).exists()) continue;
    const b = writeBatch(db);
    b.set(gref, { name: name.trim().slice(0, 40) || "My group", ownerId: user.uid, memberIds: [user.uid], createdAt: serverTimestamp() });
    b.set(memberRef(code, user.uid), memberBase(user, nick));
    await b.commit();
    return code;
  }
  throw new Error("code");
}

/** Throws "not-found" or "full". Joining a group you are already in just updates your name. */
export async function joinGroup(user: User, code: string, nick: string): Promise<string> {
  if (!db) throw new Error("no-db");
  const gref = doc(db, "groups", code);
  const snap = await getDoc(gref);
  if (!snap.exists()) throw new Error("not-found");
  const ids: string[] = snap.data().memberIds ?? [];
  if (ids.includes(user.uid)) { await setDoc(memberRef(code, user.uid), { nick: cleanNick(nick) || "Friend" }, { merge: true }); return code; }
  if (ids.length >= MAX_MEMBERS) throw new Error("full");
  const b = writeBatch(db);
  b.update(gref, { memberIds: arrayUnion(user.uid) });
  b.set(memberRef(code, user.uid), memberBase(user, nick));
  await b.commit();
  return code;
}

/** Leave a group. The last person to leave deletes it. */
export async function leaveGroup(user: User, code: string) {
  if (!db) return;
  const gref = doc(db, "groups", code);
  const snap = await getDoc(gref);
  const b = writeBatch(db);
  b.delete(memberRef(code, user.uid));
  if (snap.exists() && (snap.data().memberIds ?? []).length <= 1) b.delete(gref);
  else b.update(gref, { memberIds: arrayRemove(user.uid) });
  await b.commit();
}

export const setNick = (code: string, uid: string, nick: string) =>
  db ? setDoc(memberRef(code, uid), { nick: cleanNick(nick) || "Friend" }, { merge: true }) : Promise.resolve();

/** Mark me as sharing (one write when the switch is turned on). `until` = when my switch expires, so a switch that is never turned off stops counting by itself.
 *  The live positions go through the relay. */
export function startSharing(code: string, uid: string, until: number): Promise<void> {
  if (!db) return Promise.resolve();
  return setDoc(memberRef(code, uid), { sharing: true, until }, { merge: true }).catch(() => {});
}
/** Save my last known position (a rare checkpoint, not a live feed). Shown as "last seen" to anyone who missed the live messages. */
export function saveLastPos(code: string, uid: string, p: { lat: number; lng: number; heading: number | null; acc: number }) {
  if (!db) return;
  setDoc(memberRef(code, uid), { lat: p.lat, lng: p.lng, heading: p.heading, acc: Math.round(p.acc), at: serverTimestamp() }, { merge: true }).catch(() => {});
}
/** Stop sharing (one write). Also wipes my saved last position from the cloud. */
export function stopSharing(code: string, uid: string): Promise<void> {
  if (!db) return Promise.resolve();
  return setDoc(memberRef(code, uid), { sharing: false, until: deleteField(), lat: deleteField(), lng: deleteField(), heading: deleteField(), acc: deleteField(), at: deleteField() }, { merge: true }).catch(() => {});
}

/** Live list of the groups I am in. */
export function watchMyGroups(uid: string, cb: (g: Group[]) => void, onErr: () => void) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, "groups"), where("memberIds", "array-contains", uid)),
    (s) => cb(s.docs.map((d) => ({ code: d.id, name: d.data().name ?? "Group", ownerId: d.data().ownerId ?? "", memberIds: d.data().memberIds ?? [] }))),
    onErr);
}
/** Live members (and their positions) of one group. */
export function watchMembers(code: string, cb: (m: Member[]) => void, onErr: () => void) {
  if (!db) return () => {};
  return onSnapshot(collection(db, "groups", code, "members"), (s) => cb(s.docs.map((d) => {
    const x = d.data({ serverTimestamps: "estimate" });
    const at = (x.at as Timestamp | undefined)?.toMillis?.() ?? 0;
    return { uid: d.id, nick: x.nick ?? "Friend", photo: x.photo ?? "", sharing: !!x.sharing, lat: x.lat, lng: x.lng, heading: x.heading ?? null, acc: x.acc, at, until: typeof x.until === "number" ? x.until : undefined };
  })), onErr);
}
