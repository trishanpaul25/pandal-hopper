"use client";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { useLiveShare } from "@/lib/liveShare";

/** Always-visible reminder, on every page, while my live location is being shared. */
export default function ShareBar() {
  const { codes } = useLiveShare();
  const { lang } = useLang();
  if (!codes.length) return null;
  const n = codes.length;
  return (
    <Link href="/groups" className="sharebar">
      <i aria-hidden />
      {lang === "bn" ? `${n}টি দলের সাথে লাইভ লোকেশন শেয়ার হচ্ছে · বন্ধ করুন` : `Sharing your live location with ${n} group${n > 1 ? "s" : ""} · Manage`}
    </Link>
  );
}
