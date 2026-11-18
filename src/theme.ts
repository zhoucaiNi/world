import { Color } from "three";

// Day (soft pastel diorama) blends into night (night town) by the visitor's local clock.
// 07-17 day, 17-19 dusk, 19-05 night, 05-07 dawn. `?time=21.5` overrides the hour for previews.

const override = (() => {
  const v = new URLSearchParams(location.search).get("time");
  const h = v === null ? NaN : parseFloat(v);
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : null;
})();

export function currentHour() {
  if (override !== null) return override;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 0 = full day, 1 = full night. */
export function nightAt(hour: number) {
  if (hour >= 12) return smooth(17, 19, hour);
  return 1 - smooth(5, 7, hour);
}

/** Shared, mutable: World updates `value` every frame, the halftone shader reads it as a uniform. */
export const night = { value: nightAt(currentHour()) };

/** The HTML UI switches whole themes at the middle of dusk/dawn (CSS keys off this attribute). */
export function syncUiTheme(t: number) {
  const mode = t > 0.5 ? "night" : "day";
  if (document.documentElement.dataset.time !== mode) document.documentElement.dataset.time = mode;
}
syncUiTheme(night.value); // before first render, so the veil never flashes the wrong theme

/** Pairs of [day, night] colours. */
export const palette = {
  sky: ["#f6e3d3", "#1a2444"],
  skyTop: ["#9fc8ea", "#0a1028"],
  ground: ["#b9cfa6", "#2c4157"],
  leaf: ["#8fb98a", "#22392f"],
  trunk: ["#a07a5a", "#3a2a22"],
  hemiSky: ["#fff4e6", "#6f85d0"],
  hemiGround: ["#a08a74", "#3a4580"],
  sun: ["#fff1de", "#9fb4ff"],
  lawn: ["#b7d3a2", "#2f4a3c"],
  flowerYellow: ["#ffd96b", "#7d7346"],
  flowerPurple: ["#c9a0dc", "#4a3d5e"],
  stone: ["#c4bbb1", "#3e4152"],
  wood: ["#a8754f", "#3a2a22"],
  orange: ["#f08a3c", "#6a4a46"],
  red: ["#ec9f93", "#58384a"],
  tan: ["#e6c9a2", "#5a4d52"],
  cream: ["#fff1de", "#8a90a8"],
  path: ["#ecdfca", "#46506a"],
  water: ["#9fd0e4", "#2f5677"],
  dog: ["#e8a466", "#9c7352"],
  birdSage: ["#a9c4a8", "#2c4240"],
  birdWing: ["#a3b3c2", "#2c3a54"],
  birdBeak: ["#e3a870", "#6a4a46"],
  birdSlate: ["#6d7585", "#232a3e"],
  birdCream: ["#f4e9d6", "#8a90a8"],
  birdBiscuit: ["#d2ad88", "#5a4a50"],
  birdTaupe: ["#9a8068", "#3a3042"],
  dogLight: ["#fff4e4", "#b4c0d8"],
} as const;

export function mixPair(pair: readonly [string, string], t: number, out = new Color()) {
  return out.set(pair[0]).lerp(new Color(pair[1]), t);
}
