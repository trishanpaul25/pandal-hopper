"use client";
import { createContext, useContext, useState } from "react";

/** When the visitor plans to leave (ms timestamp), or null for "now". Used by Metro / Train, whose lines run on timetables.
 *  Not remembered: a time picked for tonight should not still be there tomorrow. */
const Ctx = createContext<{ at: number | null; setAt: (ms: number | null) => void }>({ at: null, setAt: () => {} });
export function WhenProvider({ children }: { children: React.ReactNode }) {
  const [at, setAt] = useState<number | null>(null);
  return <Ctx.Provider value={{ at, setAt }}>{children}</Ctx.Provider>;
}
export const useWhen = () => useContext(Ctx);

const IST = 330 * 60000;
/** ms timestamp -> the "YYYY-MM-DDTHH:mm" text a datetime-local input wants, in Kolkata time. */
export const toInput = (ms: number) => new Date(ms + IST).toISOString().slice(0, 16);
/** "YYYY-MM-DDTHH:mm" typed in Kolkata time -> ms timestamp (null if it is not a full date and time). */
export function fromInput(v: string): number | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(v);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - IST : null;
}
