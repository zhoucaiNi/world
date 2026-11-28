import { useSyncExternalStore } from "react";
import { WORLD } from "./worldConfig";

// The campfire is a door between the two worlds: sit down at it and a button offers the other one. The world is chosen once when
// the page loads (`?world=jurassic`), so switching fades out and reloads the page with the other value.

let atFire = false;
const listeners = new Set<() => void>();

/** Set by the player every frame: is it fully seated at one of the campfire's seats. */
export function setAtFire(next: boolean) {
  if (next === atFire) return;
  atFire = next;
  listeners.forEach((l) => l());
}

export const useAtFire = () =>
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => atFire,
  );

/** What the button offers: the other world. */
export const PORTAL_LABEL = WORLD.id === "jurassic" ? "Return to the town" : "Step into the Jurassic";

/** Fades to black, then reloads the page into the other world, keeping any other URL options (time, debug). */
export function switchWorld() {
  const url = new URL(location.href);
  if (WORLD.id === "jurassic") url.searchParams.delete("world");
  else url.searchParams.set("world", "jurassic");
  document.documentElement.classList.add("world-switching");
  setTimeout(() => location.assign(url.toString()), 450);
}
