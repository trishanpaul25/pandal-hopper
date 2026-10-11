import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

type Field = "seen" | "saved" | "savedPlaces";
const KEYS: Record<Field, string> = { seen: "ph-seen", saved: "ph-saved", savedPlaces: "ph-saved-places" };
let uid: string | null = null;

// Changes are collected for a few seconds and sent as ONE write, so tapping "seen" on five pandals in a row costs 1 write, not 5.
const FLUSH_MS = 3000;
const pending: Partial<Record<Field, string[]>> = {};
let timer: ReturnType<typeof setTimeout> | null = null;
const dropPending = () => { if (timer) clearTimeout(timer); timer = null; (Object.keys(pending) as Field[]).forEach((k) => delete pending[k]); };

export const setSyncUser = (u: string | null) => { if (u !== uid) dropPending(); uid = u; };

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  const keys = Object.keys(pending) as Field[];
  if (!keys.length) return;
  if (!db || !uid) { dropPending(); return; }
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  keys.forEach((k) => { data[k] = pending[k]; delete pending[k]; });
  setDoc(doc(db, "users", uid), data, { merge: true }).catch(() => {});
}
if (typeof window !== "undefined") { // send right away if the person leaves or switches app, so nothing is lost
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
}

/** Save one list to the signed-in user's cloud profile (batched, see above). Silently does nothing when signed out or offline. */
export function pushField(field: Field, value: string[]) {
  if (!db || !uid) return;
  pending[field] = value;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, FLUSH_MS);
}

const readLocal = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const SYNCED = "ph-synced-";

/** Runs when the app opens signed in. It merges cloud and phone lists (union), but:
 *  - only once per browser session (a refresh in the same tab skips it), and
 *  - it writes ONLY if something actually changed (first login, new name/photo, or items the cloud didn't have). */
export async function onSignIn(user: User) {
  if (!db) return;
  setSyncUser(user.uid);
  try { if (sessionStorage.getItem(SYNCED + user.uid)) return; } catch {}
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const remote: Record<string, unknown> = snap.exists() ? snap.data() : {};
    const patch: Record<string, unknown> = {};
    const profile = { name: user.displayName ?? "", email: user.email ?? "", photo: user.photoURL ?? "" };
    (Object.keys(profile) as (keyof typeof profile)[]).forEach((k) => { if (remote[k] !== profile[k]) patch[k] = profile[k]; });
    if (!snap.exists()) patch.createdAt = serverTimestamp();
    (Object.keys(KEYS) as Field[]).forEach((f) => {
      const r = Array.isArray(remote[f]) ? (remote[f] as string[]) : [];
      const union = Array.from(new Set([...r, ...readLocal(KEYS[f])]));
      try { localStorage.setItem(KEYS[f], JSON.stringify(union)); } catch {}
      if (!snap.exists() || union.length !== r.length) patch[f] = union;
    });
    if (Object.keys(patch).length) await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    try { sessionStorage.setItem(SYNCED + user.uid, "1"); } catch {}
    window.dispatchEvent(new Event("ph-sync")); // tell the pages to re-read
  } catch { /* offline or rules not set up: the app keeps working from this phone */ }
}
