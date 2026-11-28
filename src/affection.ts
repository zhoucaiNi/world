import { useSyncExternalStore } from "react";
import { WORLD } from "./worldConfig";

// How fond the shiba is of the visitor, 0..100. It starts at 50. Only the first pet of each day counts, for +5, and every
// day that passes without a pet takes off 1. A day is a calendar day by the visitor's clock. Kept in a cookie so it
// survives visits. Only the moments are stored (the value as of the last pet, and when you first pet it), and the decay is
// worked out from the clock, so nothing has to run while the page is closed.
const NAME = WORLD.affectionCookie;
const START = 50;
const STEP = 5;
const MAX = 100;
const DAY = 24 * 60 * 60 * 1000;

// v: the value at time s. s: the last pet, or the first visit if it has not been petted yet. f: the first pet.
type Saved = { v: number; s: number; f: number | null };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function read(): Saved | null {
  const part = document.cookie.split("; ").find((c) => c.startsWith(`${NAME}=`));
  if (!part) return null;
  try {
    const x = JSON.parse(decodeURIComponent(part.slice(NAME.length + 1))) as Partial<Saved>;
    if (!finite(x.v) || x.v < 0 || x.v > MAX || !finite(x.s)) return null;
    return { v: x.v, s: x.s, f: finite(x.f) ? x.f : null };
  } catch {
    return null;
  }
}

function write(s: Saved) {
  try {
    document.cookie = [
      `${NAME}=${encodeURIComponent(JSON.stringify(s))}`, "Path=/", "Max-Age=31536000", "SameSite=Lax",
      ...(location.protocol === "https:" ? ["Secure"] : []),
    ].join("; ");
  } catch { /* cookies blocked: it still works for this visit */ }
}

/** Which calendar day (by the visitor's clock) a moment falls on. */
const dayOf = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);

/** The value now: 1 point off for each whole day that passed without a pet (a clock set back counts as no time).
 *  After a pet, the day of that pet doesn't count; before the first pet, the day you arrived does. */
export function affectionAt(s: Saved, now: number) {
  const missed = Math.max(0, dayOf(now) - dayOf(s.s) - (s.f !== null ? 1 : 0));
  return Math.min(MAX, Math.max(0, s.v - missed));
}

/** Already petted today, so another pet will not add to it. */
const pettedToday = (s: Saved, now: number) => s.f !== null && dayOf(s.s) === dayOf(now);

// First visit: start at 50 from now. Later visits write it back, which also renews the cookie's lifetime.
let saved: Saved = read() ?? { v: START, s: Date.now(), f: null };
write(saved);

/** `pets` counts the pets that added points (it restarts the "+5" animation); `happyToday` is true once today's pet is in. */
export type Affection = { value: number; firstPet: number | null; pets: number; happyToday: boolean };
const view = (pets: number): Affection => {
  const now = Date.now();
  return { value: affectionAt(saved, now), firstPet: saved.f, pets, happyToday: pettedToday(saved, now) };
};
let snapshot = view(0);
const listeners = new Set<() => void>();

function publish(gained = false) {
  const next = view(snapshot.pets + (gained ? 1 : 0));
  if (!gained && next.value === snapshot.value && next.happyToday === snapshot.happyToday) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

/** A pet. The first one each day adds 5 (capped at 100) to what it has decayed to, and remembers when you first did it;
 *  further pets that day do nothing here (the dog still enjoys them). Returns whether it added points. */
export function petDog() {
  const now = Date.now();
  if (pettedToday(saved, now)) return false;
  saved = { v: Math.min(MAX, affectionAt(saved, now) + STEP), s: now, f: saved.f ?? now };
  write(saved);
  publish(true);
  return true;
}

// A tab left open across midnight should show the new day (and the decay) without a reload.
document.addEventListener("visibilitychange", () => { if (!document.hidden) publish(); });
setInterval(publish, 60_000);

export const useAffection = () =>
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => snapshot,
  );
