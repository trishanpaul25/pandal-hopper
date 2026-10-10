export type Lang = "en" | "bn";
// One entry per label. Primary language follows the toggle; the other shows as a small caption.
export const D = {
  home: { en: "Home", bn: "উৎসব" }, hop: { en: "Hop", bn: "রুট" }, pandals: { en: "Pandals", bn: "প্যান্ডেল" },
  days: { en: "Days", bn: "দিনপঞ্জি" }, guide: { en: "Guide", bn: "সহায়িকা" }, saved: { en: "My Trail", bn: "আমার ট্রেইল" },
  food: { en: "Food & Sights", bn: "খাওয়া-দাওয়া" }, night: { en: "Night Puja", bn: "রাতের পুজো" }, day: { en: "Day mode", bn: "দিনের মোড" },
  where: { en: "Where are you now?", bn: "আপনি এখন কোথায়?" }, gps: { en: "Use my location", bn: "আমার লোকেশন" },
  nearest: { en: "Nearest from", bn: "সবচেয়ে কাছে" }, go: { en: "Go", bn: "যান" },
  addRoute: { en: "Add to my trail", bn: "আমার ট্রেইলে যোগ" }, inTrail: { en: "In my trail", bn: "ট্রেইলে আছে" },
  plan: { en: "Plan all my remaining stops", bn: "বাকি সব স্টপের ক্রম সাজান" }, clear: { en: "Clear plan", bn: "মুছুন" },
  markSeen: { en: "Mark seen", bn: "দেখা হয়েছে" }, seen: { en: "Seen", bn: "দেখা" }, notSeen: { en: "Not seen", bn: "দেখা বাকি" },
  hopFrom: { en: "Hop from here", bn: "এখান থেকে হপ" }, start: { en: "Start hopping", bn: "হপ শুরু করুন" },
  browse: { en: "Browse pandals", bn: "প্যান্ডেল তালিকা" }, search: { en: "Search by name or area", bn: "নাম বা এলাকা খুঁজুন" },
  all: { en: "All", bn: "সব" }, unseenOnly: { en: "Not seen yet", bn: "দেখা বাকি" }, foodT: { en: "Food", bn: "খাবার" }, sightT: { en: "Sights", bn: "দর্শনীয়" },
  routes: { en: "Ready-made routes", bn: "তৈরি রুট" }, showMap: { en: "Show on map", bn: "মানচিত্রে দেখান" }, showing: { en: "On the map", bn: "মানচিত্রে আছে" },
  eatNear: { en: "Eat near here", bn: "কাছেই খাবার" }, order: { en: "Your order", bn: "আপনার ক্রম" },
  doneAll: { en: "You've seen every pandal on this list. Shubho Bijoya!", bn: "তালিকার সব প্যান্ডেল দেখা হয়ে গেছে। শুভ বিজয়া!" },
  empty: { en: "Choose the pandal you're at, or tap one on the map.", bn: "আপনি যে প্যান্ডেলে আছেন সেটি বাছুন, অথবা মানচিত্রে ট্যাপ করুন।" },
  far: { en: "You seem far from these pandals. Pick a starting pandal instead.", bn: "আপনি এই প্যান্ডেলগুলি থেকে অনেক দূরে। একটি প্যান্ডেল বাছুন।" },
  blocked: { en: "Location is blocked. Pick a pandal from the list instead.", bn: "লোকেশন বন্ধ আছে। তালিকা থেকে একটি প্যান্ডেল বাছুন।" },
  unmark: { en: "Remove from visited", bn: "দেখা তালিকা থেকে সরান" }, stop: { en: "Stop", bn: "থামুন" },
  heading: { en: "Heading to", bn: "যাচ্ছেন" }, imHere: { en: "I'm here · mark seen", bn: "পৌঁছে গেছি · দেখা চিহ্নিত" },
  locating: { en: "Finding your location…", bn: "আপনার লোকেশন খোঁজা হচ্ছে…" }, away: { en: "away", bn: "দূরে" },
  visited: { en: "Visited pandals", bn: "দেখা প্যান্ডেল" }, myTrail: { en: "My trail", bn: "আমার ট্রেইল" },
  openTrail: { en: "Open full trail", bn: "পুরো ট্রেইল দেখুন" }, showTrail: { en: "Show trail on map", bn: "ট্রেইল মানচিত্রে দেখান" },
  trailEmpty: { en: "Nothing in your trail yet. Tap ☆ Add to my trail on any pandal and it will appear here.", bn: "ট্রেইল এখনও খালি। যেকোনো প্যান্ডেলে ☆ ট্রেইলে যোগ চাপুন, এখানে দেখা যাবে।" },
  visitedEmpty: { en: "No pandals marked as visited yet.", bn: "এখনও কোনো প্যান্ডেল দেখা হয়নি।" },
  sos: { en: "Emergency SOS", bn: "জরুরি সহায়তা" }, share: { en: "Share trail", bn: "ট্রেইল শেয়ার" },
} as const;
export type K = keyof typeof D;
export const tx = (l: Lang, k: K) => D[k][l];
export const other = (l: Lang): Lang => (l === "en" ? "bn" : "en");
