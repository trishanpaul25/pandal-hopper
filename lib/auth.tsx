"use client";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, authConfigured } from "./firebase";
import { onSignIn, setSyncUser } from "./sync";

type Ctx = { user: User | null; loading: boolean; configured: boolean; error: string; signIn: () => Promise<void>; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ user: null, loading: false, configured: false, error: "", signIn: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(authConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u); setLoading(false);
      if (u) onSignIn(u); else setSyncUser(null);
    });
  }, []);

  const signIn = async () => {
    if (!auth) return;
    setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      setError(code === "auth/unauthorized-domain" ? "This website address isn't allowed for sign-in yet. Add it under Firebase > Authentication > Settings > Authorized domains." : "Couldn't sign in. Please try again.");
    }
  };
  const signOut = async () => { if (auth) await fbSignOut(auth); };

  return <AuthCtx.Provider value={{ user, loading, configured: authConfigured, error, signIn, signOut }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
