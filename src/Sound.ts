// Soundscape from CC0 recordings (credits in CREDITS.md). Soft piano leads across town, one
// piece by day and a gentler one by night (crossfading with the clock, Animal Crossing style),
// handing over to a guitar loop at the campfire; the fire crackle gets louder and brighter
// up close, the fountain splashes only within about 10 m of it; birds are an occasional quiet snippet by day, crickets a quiet bed at night.
// Browsers only allow audio after a user gesture, so it starts on the first click or keypress.
// When the radio (radio.zhoucai.me) is playing, the world plays the same station instead of its own music
// and turns everything else down (see radioStream.ts).

import { followRadio } from "./radioStream";

type Mix = { fire: number; fountain: number; night: number }; // fire, fountain: 0..1 closeness
type Play =
  | { kind: "loop" }
  | { kind: "occasional"; every: [min: number, max: number]; length: [min: number, max: number] }; // seconds
type LayerSpec = { file: string; peak: number; level: (m: Mix) => number; play: Play };

const LOOP: Play = { kind: "loop" };
const LAYERS = {
  musicDay: { file: "/sounds/music-day.m4a", peak: 0.5, level: ({ fire, night }) => (1 - night) * (1 - fire * fire), play: LOOP },
  musicNight: { file: "/sounds/music-night.m4a", peak: 0.45, level: ({ fire, night }) => night * (1 - fire * fire), play: LOOP },
  guitar: { file: "/sounds/guitar.m4a", peak: 0.45, level: ({ fire }) => fire * fire, play: LOOP },
  fire: { file: "/sounds/fire.m4a", peak: 0.7, level: ({ fire }) => fire, play: LOOP },
  fountain: { file: "/sounds/fountain.m4a", peak: 0.5, level: ({ fountain, night }) => fountain * (1 - night * 0.4), play: LOOP },
  crickets: { file: "/sounds/crickets.m4a", peak: 0.06, level: ({ fire, night }) => night * (1 - fire * 0.5), play: LOOP },
  birds: {
    file: "/sounds/birds.m4a",
    peak: 0.2,
    level: ({ fire, night }) => (1 - night) * (1 - fire * 0.7),
    play: { kind: "occasional", every: [20, 45], length: [2, 4] },
  },
} satisfies Record<string, LayerSpec>;
type Layer = keyof typeof LAYERS;
const ALL = Object.keys(LAYERS) as Layer[];

let ctx: AudioContext | null = null;
let master: GainNode;
let fireFilter: BiquadFilterNode;
const gains = {} as Record<Layer, GainNode>;
const drift = Object.fromEntries(ALL.map((l) => [l, 1])) as Record<Layer, number>;
let muted = (() => { try { return localStorage.getItem("world-sound") === "off"; } catch { return false; } })();
// User volumes, 0..1: music covers day, night and guitar.
export const CHANNELS = ["master", "music", "fire", "fountain", "crickets", "birds"] as const;
export type Channel = (typeof CHANNELS)[number];
const CHANNEL_OF: Record<Layer, Exclude<Channel, "master">> = { musicDay: "music", musicNight: "music", guitar: "music", fire: "fire", fountain: "fountain", crickets: "crickets", birds: "birds" };
const volumes = Object.fromEntries(CHANNELS.map((c) => [c, 1])) as Record<Channel, number>;
try {
  const saved = JSON.parse(localStorage.getItem("world-volumes") ?? "{}");
  for (const c of CHANNELS) if (typeof saved[c] === "number") volumes[c] = Math.min(Math.max(saved[c], 0), 1);
} catch { /* storage unavailable or malformed */ }
let inputs: Record<Layer, AudioNode>;
const requested = new Set<Layer>();
let fireLevel = 0; // 0..1, how close the visitor is to the fire
let fountainLevel = 0;
let nightLevel = 0;
let radioOn = false; // the radio is playing in the world
const MUSIC: Layer[] = ["musicDay", "musicNight", "guitar"];
const RADIO_DUCK = 0.35; // everything but the radio plays at this fraction while it is on

const rand = ([min, max]: [number, number]) => min + Math.random() * (max - min);

async function load(c: AudioContext, layer: Layer, into: AudioNode) {
  const res = await fetch(LAYERS[layer].file);
  const buf = await c.decodeAudioData(await res.arrayBuffer());
  const play: Play = LAYERS[layer].play;
  if (play.kind === "loop") {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(into);
    src.start(0, Math.random() * buf.duration); // random start point, so it never sounds like a restart
    return;
  }
  // A short faded snippet from a random spot in the recording, then a long quiet gap.
  const snippet = () => {
    const len = Math.min(rand(play.length), buf.duration);
    const at = Math.random() * (buf.duration - len);
    const t = c.currentTime;
    const src = c.createBufferSource();
    const fade = c.createGain();
    src.buffer = buf;
    fade.gain.setValueAtTime(0, t);
    fade.gain.linearRampToValueAtTime(1, t + 0.4);
    fade.gain.setValueAtTime(1, t + len - 0.6);
    fade.gain.linearRampToValueAtTime(0, t + len);
    src.connect(fade).connect(into);
    src.start(t, at, len);
    setTimeout(snippet, rand(play.every) * 1000);
  };
  setTimeout(snippet, rand(play.every) * 500);
}

function start() {
  if (ctx) { void ctx.resume(); return; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const c = (ctx = new AC());
  master = c.createGain();
  master.gain.value = muted ? 0 : volumes.master;
  master.connect(c.destination);

  for (const layer of ALL) {
    gains[layer] = c.createGain();
    gains[layer].gain.value = 0;
    gains[layer].connect(master);
  }
  // Far away the fire is a muffled low roar; up close the crackle opens up.
  fireFilter = c.createBiquadFilter();
  fireFilter.type = "lowpass";
  fireFilter.frequency.value = 600;
  fireFilter.connect(gains.fire);

  inputs = { ...gains, fire: fireFilter };

  // Slow random swells on the textures, so they breathe instead of sitting flat.
  setInterval(() => {
    drift.crickets = 0.8 + Math.random() * 0.2;
    drift.fire = 0.9 + Math.random() * 0.1;
    apply(3);
  }, 4000);

  apply(0.5);
}

function apply(smooth = 0.3) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const mix: Mix = { fire: fireLevel, fountain: fountainLevel, night: nightLevel };
  for (const layer of ALL) {
    const { peak, level }: LayerSpec = LAYERS[layer];
    // The radio replaces the world's own music and sits on top of the rest, which dips.
    const v = level(mix) * (radioOn ? (MUSIC.includes(layer) ? 0 : RADIO_DUCK) : 1);
    // Fetch a layer only once it first becomes audible: a daytime visit never downloads the
    // night music, and the fire and guitar wait until you head toward the campfire.
    if (v > 0.001 && !requested.has(layer)) {
      requested.add(layer);
      void load(ctx, layer, inputs[layer]);
    }
    gains[layer].gain.setTargetAtTime(v * peak * drift[layer] * volumes[CHANNEL_OF[layer]], t, smooth);
  }
  fireFilter.frequency.setTargetAtTime(600 + fireLevel * fireLevel * 7400, t, smooth);
}

const closeness = (distance: number, reach: number, near: number) => {
  const x = Math.min(Math.max((reach - distance) / (reach - near), 0), 1);
  return x * x * (3 - 2 * x);
};

/** Called every frame with the visitor's distance to the fire and the fountain, and the 0..1 night value. */
export function updateSound(fireDistance: number, fountainDistance: number, night: number) {
  const fire = closeness(fireDistance, 12, 2);
  const fountain = closeness(fountainDistance, 10, 2);
  if (Math.abs(fire - fireLevel) < 0.01 && Math.abs(fountain - fountainLevel) < 0.01 && Math.abs(night - nightLevel) < 0.01) return;
  fireLevel = fire;
  fountainLevel = fountain;
  nightLevel = night;
  apply();
}

const radio = followRadio({
  level: () => (muted ? 0 : volumes.master * volumes.music),
  onPlaying: (on) => { radioOn = on; apply(1); },
});

/** The world's radio: the switch, station and volume, and a snapshot to subscribe to. */
export { radio };

export function getVolumes() { return { ...volumes }; }

export function setVolume(channel: Channel, value: number) {
  volumes[channel] = Math.min(Math.max(value, 0), 1);
  try { localStorage.setItem("world-volumes", JSON.stringify(volumes)); } catch { /* storage unavailable */ }
  radio.refresh();
  if (!ctx) return;
  if (channel === "master") { if (!muted) master.gain.setTargetAtTime(volumes.master, ctx.currentTime, 0.05); }
  else apply(0.05);
}

export function isMuted() { return muted; }

// The mixer UI listens, so un-muting from the radio keeps its switch in step.
const muteListeners = new Set<(m: boolean) => void>();
export function onMuteChange(fn: (m: boolean) => void) { muteListeners.add(fn); return () => { muteListeners.delete(fn); }; }

export function setMuted(m: boolean) {
  muted = m;
  muteListeners.forEach((l) => l(m));
  try { localStorage.setItem("world-sound", m ? "off" : "on"); } catch { /* storage unavailable */ }
  radio.refresh();
  if (m) { if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
  else { start(); if (ctx) master.gain.setTargetAtTime(volumes.master, ctx.currentTime, 0.05); }
}

// First gesture anywhere starts the audio (unless muted).
const kick = () => {
  if (!muted) start();
  window.removeEventListener("pointerdown", kick);
  window.removeEventListener("keydown", kick);
};
window.addEventListener("pointerdown", kick);
window.addEventListener("keydown", kick);

// Dev only: a hot-reloaded copy of this module would leave the old audio context, loops, timers and radio stream
// playing under the new ones, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
