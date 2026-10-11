"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang";
import { tx } from "@/lib/i18n";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** "Install app" button. Android/desktop Chrome: triggers the native prompt. iPhone Safari: shows Add to Home Screen steps.
 *  Hidden once the site is already running as an installed app. */
export default function InstallButton() {
  const { lang } = useLang();
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(true); // hidden until we know
  const [tip, setTip] = useState(false);

  useEffect(() => {
    const isStandalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    const ua = navigator.userAgent;
    setIos(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const onInstalled = () => { setEvt(null); setStandalone(true); };
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => { removeEventListener("beforeinstallprompt", onPrompt); removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (standalone || (!evt && !ios)) return null;

  const click = async () => {
    if (evt) { await evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); }
    else setTip((v) => !v);
  };

  return (
    <span style={{ position: "relative" }}>
      <button className="iconbtn" onClick={click} aria-expanded={!evt ? tip : undefined}>
        ⬇️<span className="hide-s">{tx(lang, "install")}</span>
      </button>
      {tip && (
        <span role="status" className="install-tip" onClick={() => setTip(false)}>{tx(lang, "iosHow")}</span>
      )}
    </span>
  );
}
