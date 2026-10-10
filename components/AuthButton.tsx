"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { tx } from "@/lib/i18n";

/** Header shortcut: "Sign in" when signed out, the user's photo when signed in. Both open /login. */
export default function AuthButton() {
  const { user, loading, configured } = useAuth();
  const { lang } = useLang();
  if (!configured || loading) return null;
  if (!user) return <Link href="/login" className="iconbtn">👤<span className="hide-s">{tx(lang, "signIn")}</span></Link>;
  return (
    <Link href="/login" className="iconbtn" aria-label={user.displayName ?? "Account"} style={{ padding: 0, overflow: "hidden" }}>
      {user.photoURL
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.photoURL} alt="" width={40} height={40} referrerPolicy="no-referrer" style={{ borderRadius: "50%", display: "block" }} />
        : <span style={{ padding: "0 14px" }}>{(user.displayName ?? "U")[0]}</span>}
    </Link>
  );
}
