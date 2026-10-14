"use client";
import { useLang } from "@/lib/lang";
import { useTrails } from "@/lib/trails";

/** Compact "which trail am I using" picker. Managing trails (name, rename, delete) happens on /saved. */
export default function TrailSwitcher() {
  const { lang } = useLang();
  const t = useTrails();
  if (t.trails.length < 2) return null;
  return (
    <select className="search" style={{ minHeight: 38, width: "auto", maxWidth: 200, fontSize: 14, padding: "0 10px" }} value={t.activeId} onChange={(e) => t.setActive(e.target.value)}
      aria-label={lang === "bn" ? "ট্রেইল বেছে নিন" : "Choose trail"}>
      {t.trails.map((x) => <option key={x.id} value={x.id}>{x.group ? "👥 " : ""}{x.name} ({x.ids.length})</option>)}
    </select>
  );
}
