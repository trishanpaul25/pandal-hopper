import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { cleanNick, type Group } from "./groups";
import type { Trail } from "./trails";

/** Shared trails. Data layout (Firestore):
 *  groups/{CODE}/trails/{tid}   name, ids[], sharedBy, updatedBy, updatedByName, createdAt, updatedAt
 *  Every member of the group can read the trail and add / remove stops or rename it (see firestore.rules).
 *  Only the person who shared it, or the group owner, can delete it.
 *  Stops are changed with arrayUnion / arrayRemove, so two friends editing at the same moment never overwrite each other. */
export const MAX_GROUP_STOPS = 200;
export const GPREFIX = "g:";
export const gid = (code: string, tid: string) => `${GPREFIX}${code}:${tid}`;
export const ERR_EVT = "ph-gtrail-error";

const newTid = () => "t-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cleanName = (n: string) => n.replace(/\s+/g, " ").trim().slice(0, 40);
const uniq = (a: string[]) => Array.from(new Set(a));

/** Who is making this change (shown as "Last edit by …"). */
function who() {
  const u = auth?.currentUser;
  if (!u) throw new Error("signed-out");
  let nick = "";
  try { const s = JSON.parse(localStorage.getItem("ph-nick") || "\"\""); if (typeof s === "string") nick = s; } catch {}
  return { uid: u.uid, name: cleanNick(nick || u.displayName?.split(" ")[0] || "") || "Friend" };
}
const tref = (code: string, tid: string) => doc(db!, "groups", code, "trails", tid);
const report = (e: unknown) => { try { window.dispatchEvent(new CustomEvent(ERR_EVT, { detail: (e as { code?: string })?.code ?? "" })); } catch {} };

/** Can this person delete the shared trail? (the one who shared it, or the group owner) */
export const canManageTrail = (t: Trail) => {
  const uid = auth?.currentUser?.uid;
  return !!(uid && t.group && (t.group.sharedBy === uid || t.group.owner === uid));
};

/** Put a copy of a trail into a group. Returns the id the trail will have in useTrails(). */
export async function shareTrail(code: string, name: string, ids: string[]): Promise<string> {
  if (!db) throw new Error("no-db");
  const me = who(), tid = newTid();
  await setDoc(tref(code, tid), {
    name: cleanName(name) || "Shared trail", ids: uniq(ids).slice(0, MAX_GROUP_STOPS),
    sharedBy: me.uid, updatedBy: me.uid, updatedByName: me.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return gid(code, tid);
}

/** Add and/or remove stops. Resolves when the server has it; the screen updates straight away from the local copy. */
export async function editGroupStops(t: Trail, add: string[], remove: string[]): Promise<void> {
  if (!db || !t.group) return;
  try {
    const me = who(), r = tref(t.group.code, t.group.tid);
    const stamp = { updatedBy: me.uid, updatedByName: me.name, updatedAt: serverTimestamp() };
    const rem = uniq(remove).filter((i) => t.ids.includes(i));
    const room = Math.max(0, MAX_GROUP_STOPS - (t.ids.length - rem.length));
    const adds = uniq(add).filter((i) => !t.ids.includes(i)).slice(0, room);
    // Firestore does not allow union and remove on the same field in one update, so these are two writes.
    if (rem.length) await updateDoc(r, { ids: arrayRemove(...rem), ...stamp });
    if (adds.length) await updateDoc(r, { ids: arrayUnion(...adds), ...stamp });
  } catch (e) { report(e); }
}

export async function renameGroupTrail(t: Trail, name: string): Promise<void> {
  const n = cleanName(name);
  if (!db || !t.group || !n) return;
  try { const me = who(); await updateDoc(tref(t.group.code, t.group.tid), { name: n, updatedBy: me.uid, updatedByName: me.name, updatedAt: serverTimestamp() }); }
  catch (e) { report(e); }
}

export async function deleteGroupTrail(t: Trail): Promise<void> {
  if (!db || !t.group) return;
  try { await deleteDoc(tref(t.group.code, t.group.tid)); } catch (e) { report(e); }
}

const toTrail = (g: Pick<Group, "code" | "name" | "ownerId">, id: string, d: DocumentData): Trail => ({
  id: gid(g.code, id),
  name: typeof d.name === "string" && d.name ? d.name : "Shared trail",
  ids: Array.isArray(d.ids) ? Array.from(new Set((d.ids as unknown[]).filter((x): x is string => typeof x === "string"))) : [],
  group: { code: g.code, tid: id, groupName: g.name, sharedBy: String(d.sharedBy ?? ""), owner: g.ownerId, editedBy: typeof d.updatedByName === "string" ? d.updatedByName : "" },
});

/** Live list of the shared trails in one group. */
export function watchGroupTrails(g: Pick<Group, "code" | "name" | "ownerId">, cb: (t: Trail[]) => void, onErr: () => void) {
  if (!db) return () => {};
  return onSnapshot(collection(db, "groups", g.code, "trails"), (s) => cb(s.docs.map((d) => toTrail(g, d.id, d.data()))), onErr);
}
