// Original line-art illustrations (no photos): a chalchitra arch with an alpona border and a diya.
const TONES: Record<string, [string, string]> = {
  north: ["#c1121f", "#f2a900"], south: ["#e8930c", "#970012"], west: ["#970012", "#e8930c"], other: ["#c1121f", "#e8930c"],
};
export function Arch({ tone = "north", className = "" }: { tone?: string; className?: string }) {
  const [a, b] = TONES[tone] ?? TONES.other;
  const id = "g" + tone;
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-label="Illustrated pandal arch" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} stopOpacity=".9" /></linearGradient>
      </defs>
      <rect width="200" height="150" fill={`url(#${id})`} opacity=".18" />
      <path d="M40 150V70Q40 18 100 18Q160 18 160 70V150Z" fill="#fdfbf7" stroke={a} strokeWidth="3" />
      <path d="M52 150V72Q52 30 100 30Q148 30 148 72V150Z" fill="none" stroke={b} strokeWidth="1.5" strokeDasharray="2 4" />
      <path d="M100 40l4 8h-8z" fill={b} />
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={64 + i * 18} cy={128} r="3" fill={a} opacity=".55" />)}
      <path d="M100 74c10 0 16 8 16 18 0 12-9 20-16 20s-16-8-16-20c0-10 6-18 16-18z" fill="none" stroke={a} strokeWidth="2.5" />
      <path d="M100 84c4 4 5 9 0 14-5-5-4-10 0-14z" fill={b} />
      <path d="M20 150c10-6 18-6 28 0M152 150c10-6 18-6 28 0" stroke={a} strokeWidth="2" fill="none" opacity=".6" />
    </svg>
  );
}
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="10" fill="#c1121f" />
      <path d="M10 34V19Q10 8 20 8Q30 8 30 19V34" fill="none" stroke="#fdfbf7" strokeWidth="2.5" />
      <path d="M20 17c3 3 3 7 0 10-3-3-3-7 0-10z" fill="#f2a900" />
      <rect x="8" y="34" width="24" height="3" rx="1.5" fill="#f2a900" />
    </svg>
  );
}
