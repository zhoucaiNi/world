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

/** The stall radio's interaction state: close enough to use it, and which prompt the crosshair is on. */
export type RadioUi = { near: boolean; hover: "toggle" | "settings" | null };
let radioUi: RadioUi = { near: false, hover: null };
const radioListeners = new Set<() => void>();

export const getRadioUi = () => radioUi;

export function setRadioUi(patch: Partial<RadioUi>) {
  const next = { ...radioUi, ...patch };
  if (next.near === radioUi.near && next.hover === radioUi.hover) return;
  radioUi = next;
  radioListeners.forEach((l) => l());
}

export const useRadioUi = () =>
  useSyncExternalStore(
    (l) => { radioListeners.add(l); return () => { radioListeners.delete(l); }; },
    () => radioUi,
  );
