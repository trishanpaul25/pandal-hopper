"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { useSaved, useSeen } from "@/lib/store";
import { tx } from "@/lib/i18n";

export default function Login() {
  const { user, loading, configured, error, signIn, signOut } = useAuth();
  const { lang } = useLang();
  const [seen] = useSeen(); const [saved] = useSaved();
  const bn = lang === "bn";
  return (
    <div className="page">
      <span className="eyebrow">{bn ? "আপনার অ্যাকাউন্ট" : "Your account"}</span>
      <h1 className="h1">{user ? (bn ? "স্বাগতম" : "Welcome") : (bn ? "সাইন ইন" : "Sign in")}</h1>

      {!configured ? (
        <div className="empty" style={{ marginTop: 16 }}>Sign-in isn't set up yet. Add your Firebase keys to <code>.env.local</code> (see <code>.env.example</code>) and restart.</div>
      ) : loading ? (
        <p className="muted">…</p>
      ) : user ? (
        <div className="card paar" style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 520 }}>
          <div className="row" style={{ gap: 14, alignItems: "center" }}>
            {user.photoURL
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.photoURL} alt="" width={64} height={64} referrerPolicy="no-referrer" style={{ borderRadius: "50%" }} />
              : <b style={{ fontSize: 32 }}>👤</b>}
            <div><h3 style={{ fontSize: 22 }}>{user.displayName}</h3><p className="muted small" style={{ margin: 0 }}>{user.email}</p></div>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {bn ? `${seen.length}টি দেখা, ট্রেইলে ${saved.length}টি। আপনার তথ্য এই অ্যাকাউন্টে সেভ হচ্ছে, যেকোনো ফোনে সাইন ইন করলেই পাবেন।` : `${seen.length} pandals seen, ${saved.length} in your trail. These are saved to your account, so they follow you to any phone you sign in on.`}
          </p>
          <div className="row">
            <Link className="btn primary" href="/hop">{tx(lang, "start")}</Link>
            <button className="btn outline" onClick={signOut}>{bn ? "সাইন আউট" : "Sign out"}</button>
          </div>
        </div>
      ) : (
        <div className="card paar" style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 520 }}>
          <p style={{ margin: 0 }}>{bn ? "গুগল দিয়ে এক ট্যাপে অ্যাকাউন্ট খুলুন বা সাইন ইন করুন। নতুন হলে অ্যাকাউন্ট নিজে থেকেই তৈরি হবে।" : "Use your Google account to register or sign in with one tap. If you're new, your account is created automatically."}</p>
          <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>{bn ? "দেখা প্যান্ডেল ও ট্রেইল সব ডিভাইসে মিলবে" : "Your seen pandals and trail sync across devices"}</li>
            <li>{bn ? "এখন পর্যন্ত এই ফোনে যা সেভ করেছেন তা হারাবে না" : "Anything already saved on this phone is kept and merged"}</li>
          </ul>
          <button className="btn primary big" onClick={signIn}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
            {bn ? "গুগল দিয়ে চালিয়ে যান" : "Continue with Google"}
          </button>
          {error && <p className="msg" style={{ margin: 0 }}>{error}</p>}
          <p className="muted small" style={{ margin: 0 }}>{bn ? "সাইন ইন ছাড়াও অ্যাপ ব্যবহার করা যাবে।" : "You can also keep using the app without signing in."}</p>
        </div>
      )}
    </div>
  );
}
