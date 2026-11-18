import { useSyncExternalStore } from "react";

/** off: not aimed at the shiba. aimed: in reach. petted: aimed, but just petted, so the prompt stays quiet. */
export type Aim = "off" | "aimed" | "petted";

let state: Aim = "off";
const listeners = new Set<() => void>();

export function setAim(next: Aim) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useAim = () => useSyncExternalStore(subscribe, () => state);
