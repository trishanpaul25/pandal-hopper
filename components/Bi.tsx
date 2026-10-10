"use client";
import { K, D, other } from "@/lib/i18n";
import { useLang } from "@/lib/lang";

/** Primary text in the chosen language, small caption in the other one. */
export default function Bi({ k, caption = true }: { k: K; caption?: boolean }) {
  const { lang } = useLang();
  return <>{D[k][lang]}{caption && <span className="cap"> {D[k][other(lang)]}</span>}</>;
}
