import { useSyncExternalStore } from "react";

// How fond the shiba is of the visitor, 0..100. It starts at 50, each pet adds 5, and every full day without a pet
// takes off 1. Kept in a cookie so it survives visits. Only the moments are stored (the value as of the last pet, and
// when you first pet it), and the decay is worked out from the clock, so nothing has to run while the page is closed.
const NAME = "world-dog";
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

/** The value now: one point off for each full day since it was last set (a clock set back counts as no time). */
export function affectionAt(s: Saved, now: number) {
  return Math.min(MAX, Math.max(0, s.v - Math.floor(Math.max(0, now - s.s) / DAY)));
}

// First visit: start at 50 from now. Later visits write it back, which also renews the cookie's lifetime.
let saved: Saved = read() ?? { v: START, s: Date.now(), f: null };
write(saved);

export type Affection = { value: number; firstPet: number | null; pets: number };
let snapshot: Affection = { value: affectionAt(saved, Date.now()), firstPet: saved.f, pets: 0 };
const listeners = new Set<() => void>();

function publish(petted: boolean) {
  const value = affectionAt(saved, Date.now());
  if (!petted && value === snapshot.value) return;
  snapshot = { value, firstPet: saved.f, pets: snapshot.pets + (petted ? 1 : 0) };
  listeners.forEach((l) => l());
}

/** One pet: +5 on top of whatever it has decayed to, capped at 100. Remembers when you first did it. */
export function petDog() {
  const now = Date.now();
  saved = { v: Math.min(MAX, affectionAt(saved, now) + STEP), s: now, f: saved.f ?? now };
  write(saved);
  publish(true);
}

// A tab left open across midnight should show the decay when it is looked at again.
document.addEventListener("visibilitychange", () => { if (!document.hidden) publish(false); });

export const useAffection = () =>
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => snapshot,
  );
