// The world's radio. The visitor turns it on and off at the radio in the world and it plays inside this page. Which
// station and how loud come from the cookie radio.zhoucai.me writes on *.zhoucai.me (the radio's own defaults when
// there is none); the settings live on the radio site, which the radio in the world links to. The world only writes
// `on` to that cookie, and a `radio-world` heartbeat while it is audible, so the radio site steps aside (see sharedCookie.ts).
// A plain <audio> element, as the radio uses: the streams do not send CORS headers, so Web Audio could not read them.

import { clearHeartbeat, otherWorldPlaying, readShared, setHeartbeat, writeOn } from "./sharedCookie";

// What the radio itself starts with (its stored defaults), used when it is on but no station or volume was saved.
const DEFAULT_STATION = "groovesalad";
const DEFAULT_VOLUME = 0.7;
const POLL_MS = 2000;
const PAUSE_GRACE_MS = 2500; // a station switch pauses briefly; don't un-duck the world for that

type Station = { channelId: string; volume: number };
export type RadioState = Station & { on: boolean };

/** The cookie's station and volume, field by field, or `fallback` where a field is missing or invalid. */
function readStation(fallback: Station): Station {
  const { channelId = fallback.channelId, volume = fallback.volume } = readShared();
  return { channelId, volume };
}

const tabId = Math.random().toString(36).slice(2);

async function fetchStreams(id: string): Promise<string[]> {
  const res = await fetch(`https://api.somafm.com/${id}.pls`);
  if (!res.ok) throw new Error(`${id}.pls responded ${res.status}`);
  const entries: [number, string][] = [];
  for (const line of (await res.text()).split(/\r?\n/)) {
    const m = /^File(\d+)=(.+)$/.exec(line.trim());
    if (m) entries.push([Number(m[1]), m[2].trim()]);
  }
  return entries.sort((a, b) => a[0] - b[0]).map(([, url]) => url);
}

type Options = {
  /** How loud the radio should be in the world, 0..1, before the radio's own volume (master, music, mute). */
  level: () => number;
  /** Called when the stream starts or stops being audible, so the other sounds can duck. */
  onPlaying: (playing: boolean) => void;
};

/** `setOn` is the visitor's switch; `refresh` re-applies the volume after they change the mixer. */
export function followRadio({ level, onPlaying }: Options) {
  const audio = new Audio();
  const streams = new Map<string, string[]>();
  let state: Station = readStation({ channelId: DEFAULT_STATION, volume: DEFAULT_VOLUME });
  let on = readShared().on === true;
  let snapshot: RadioState = { ...state, on };
  const listeners = new Set<() => void>();
  const publish = () => {
    if (snapshot.channelId === state.channelId && snapshot.volume === state.volume && snapshot.on === on) return;
    snapshot = { ...state, on };
    listeners.forEach((l) => l());
  };
  let loaded = ""; // station currently set as the source
  let mirror = 0;
  let announced = false;
  let pauseTimer = 0;

  // A radio set to volume 0 is as good as off: no music, and nothing to duck the world for.
  const wanted = () => on && state.volume > 0 && level() > 0 && !otherWorldPlaying(tabId);
  const volume = () => Math.min(1, state.volume * level());
  const announce = (playing: boolean) => {
    clearTimeout(pauseTimer);
    if (playing === announced) return;
    announced = playing;
    if (playing) setHeartbeat(tabId); else clearHeartbeat(tabId);
    onPlaying(playing);
  };
  // Stops the download too: removing the src alone leaves a live stream connected.
  const detach = () => {
    if (!audio.paused) audio.pause();
    if (audio.getAttribute("src") !== null) { audio.removeAttribute("src"); audio.load(); }
    loaded = "";
  };

  const prime = (id: string) => {
    if (streams.has(id)) return;
    streams.set(id, []); // claimed, so it is only fetched once
    fetchStreams(id).then(
      (list) => { if (list.length) { streams.set(id, list); sync(); } else streams.delete(id); },
      () => streams.delete(id), // forgotten, so the next poll tries again
    );
  };

  const setSource = (id: string) => {
    const list = streams.get(id);
    if (!list?.length) return false;
    audio.src = list[mirror % list.length];
    loaded = id;
    return true;
  };

  // Safari only starts audio inside a gesture, so this is also retried on every click, tap and key.
  const tryPlay = () => {
    if (!wanted()) return;
    if (loaded !== state.channelId && !setSource(state.channelId)) return;
    if (audio.paused) {
      // Blocked from starting without a gesture: give the music back, so the radio site plays instead.
      audio.play().catch((e) => { if (e?.name === "NotAllowedError") announce(false); });
    }
  };

  function sync() {
    state = readStation(state);
    on = readShared().on === true;
    publish();
    if (announced) setHeartbeat(tabId);
    audio.volume = volume();
    if (wanted()) {
      prime(state.channelId);
      if (loaded !== state.channelId) { mirror = 0; detach(); }
      tryPlay();
    } else {
      detach();
      announce(false);
    }
  }

  audio.addEventListener("playing", () => { mirror = 0; announce(true); });
  audio.addEventListener("pause", () => {
    // Switching station pauses for a moment; only un-duck if it stays paused.
    clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => { if (!wanted()) announce(false); }, PAUSE_GRACE_MS);
  });
  audio.addEventListener("error", () => {
    // That mirror failed: try the next one for this station. Ignore errors from a station we already left.
    const list = streams.get(state.channelId);
    if (!list?.some((u) => new URL(u, location.href).href === audio.currentSrc)) return;
    if (mirror + 1 >= list.length) {
      // Every mirror failed: start over from the first on the next poll.
      mirror = 0;
      loaded = "";
      announce(false);
      return;
    }
    mirror++;
    loaded = "";
    tryPlay();
  });

  setInterval(sync, POLL_MS);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => clearHeartbeat(tabId));
  window.addEventListener("pageshow", sync);
  // Touch input only counts as a play-allowed gesture on release, so listen for that as well as the press.
  for (const gesture of ["pointerdown", "pointerup", "click", "keydown"]) window.addEventListener(gesture, tryPlay);
  sync();

  return {
    refresh: sync,
    /** Fetch the station list ahead of the click (hovering or pressing the switch), so play starts inside the gesture. A visitor who never touches the switch never asks SomaFM. */
    warm: () => prime(state.channelId),
    isOn: () => on,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getSnapshot: () => snapshot,
    /** Call from the click that flips the switch: Safari only starts audio inside a gesture. */
    setOn(next: boolean) {
      writeOn(next);
      prime(state.channelId);
      sync();
    },
  };
}
