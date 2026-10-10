"use client";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { tx } from "@/lib/i18n";

const CARDS = [
  ["Getting around", "যাতায়াত", ["Plan short clusters of pandals that are close together. Long cab rides between stops eat the night.", "Metro Railway usually announces extra late services during puja. Check its notice for this year's timings.", "Police set up no-entry and one-way zones near big pandals. Follow the signs and the volunteers.", "Cab and auto prices rise at night. Agree the fare or use the meter before you start."]],
  ["Stay safe in crowds", "ভিড়ে নিরাপদ থাকুন", ["Agree a meeting spot with your group before you enter a pandal lane.", "Keep phones and wallets in front pockets. Charge your phone and carry a power bank.", "Hold small children's hands, or write a contact number on their wrist or bag.", "If you feel unwell or unsafe, step out of the queue and ask a volunteer or police officer."]],
  ["Pandal manners", "প্যান্ডেলের শিষ্টাচার", ["Take off footwear where asked and keep to the queue lines.", "Ask before photographing people, and don't block the way for a selfie.", "Keep the lane clean. Use the bins or carry your waste out.", "Sindoor khela on Dashami is for those taking part. Ask before joining in or filming."]],
  ["Make your night easier", "রাত সহজ করুন", ["Eat early or in between clusters. Pandal lanes get stuck after 10 pm.", "Wear comfortable shoes you can walk in for hours.", "Use the Hop page's nearest-next view instead of deciding in the lane.", "Open this site once while online. It then loads faster on weak signal."]],
] as const;

export default function Guide() {
  const { lang } = useLang();
  return (
    <div className="page">
      <span className="eyebrow">{lang === "bn" ? "পুজো সহায়িকা" : "Puja field manual"}</span>
      <h1 className="h1">{lang === "bn" ? "দর্শনার্থীর গাইড" : "Visitor guide"}</h1>
      <div className="sosbar" style={{ marginTop: 16 }} role="group" aria-label={tx(lang, "sos")}>
        {[["112", "All emergencies"], ["100", "Police"], ["102", "Ambulance"], ["1091", "Women helpline"]].map(([n, l]) => (
          <a key={n} href={`tel:${n}`}><b>{n}</b><span>{l}</span></a>
        ))}
      </div>
      <div className="grid2" style={{ marginTop: 18 }}>
        {CARDS.map(([en, bn, items]) => (
          <div className="card paar" key={en}>
            <h2 style={{ fontSize: 22 }}>{lang === "bn" ? bn : en}</h2><span className="cap">{lang === "bn" ? en : bn}</span>
            <ul className="plain">{items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <Link className="btn primary big" href="/hop">{tx(lang, "start")}</Link>
        <Link className="btn outline big" href="/food">{tx(lang, "food")}</Link>
      </div>
    </div>
  );
}
