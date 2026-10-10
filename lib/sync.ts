import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

type Field = "seen" | "saved" | "savedPlaces";
const KEYS: Record<Field, string> = { seen: "ph-seen", saved: "ph-saved", savedPlaces: "ph-saved-places" };
let uid: string | null = null;
export const setSyncUser = (u: string | null) => { uid = u; };

/** Save one list to the signed-in user's cloud profile. Silently does nothing when signed out or offline. */
export function pushField(field: Field, value: string[]) {
  if (!db || !uid) return;
  setDoc(doc(db, "users", uid), { [field]: value, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}

const readLocal = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };

/** Run once after sign-in: create the profile on first login, then merge cloud and phone lists (union) and save both ways. */
export async function onSignIn(user: User) {
  if (!db) return;
  setSyncUser(user.uid);
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const remote: Record<string, unknown> = snap.exists() ? snap.data() : {};
    const merged: Record<string, unknown> = {
      name: user.displayName ?? "", email: user.email ?? "", photo: user.photoURL ?? "", lastLogin: serverTimestamp(),
    };
    if (!snap.exists()) merged.createdAt = serverTimestamp();
    (Object.keys(KEYS) as Field[]).forEach((f) => {
      const union = Array.from(new Set([...(Array.isArray(remote[f]) ? (remote[f] as string[]) : []), ...readLocal(KEYS[f])]));
      merged[f] = union;
      try { localStorage.setItem(KEYS[f], JSON.stringify(union)); } catch {}
    });
    await setDoc(ref, merged, { merge: true });
    window.dispatchEvent(new Event("ph-sync")); // tell the pages to re-read
  } catch { /* offline or rules not set up: the app keeps working from this phone */ }
}
