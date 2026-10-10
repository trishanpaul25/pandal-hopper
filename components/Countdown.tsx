"use client";
import { useEffect, useState } from "react";
import { DAYS, PUJA_START } from "@/lib/data";

export default function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i); }, []);
  if (now === null) return <p className="count">&nbsp;</p>;
  const diff = new Date(PUJA_START).getTime() - now;
  if (diff > 0) {
    const d = Math.floor(diff / 864e5), h = Math.floor((diff % 864e5) / 36e5);
    return <p className="count"><b>{d}</b> days <b>{h}</b> hours to Maha Shashthi</p>;
  }
  const today = DAYS.find((x) => new Date(x.date + "T00:00:00+05:30").getTime() <= now && now < new Date(x.date + "T00:00:00+05:30").getTime() + 864e5);
  return <p className="count">{today ? <>Today: <b>{today.en}</b> ({today.bn})</> : <>Puja days are over. Shubho Bijoya!</>}</p>;
}
