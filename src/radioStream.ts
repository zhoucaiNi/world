// The world's radio. The visitor turns it on and off in the world; it plays inside this page. Which station and how
// loud come from the cookie radio.zhoucai.me writes on *.zhoucai.me (the radio's own defaults when there is none).
// A plain <audio> element, as the radio uses: the streams do not send CORS headers, so Web Audio could not read them.

// The radio's lineup. The cookie is readable by every *.zhoucai.me site, so only these ids are ever used in a URL.
const STATIONS = ["groovesalad", "lush", "bossa", "dronezone", "fluid", "deepspaceone", "folkfwd", "secretagent"];
// What the radio itself starts with (its stored defaults), used when it is on but no station or volume was saved.
const DEFAULT_STATION = "groovesalad";
const DEFAULT_VOLUME = 0.7;
const POLL_MS = 2000;
const PAUSE_GRACE_MS = 2500; // a station switch pauses briefly; don't un-duck the world for that

type Station = { channelId: string; volume: number };

function readStation(): Station {
  const part = document.cookie.split("; ").find((c) => c.startsWith("radio="));
  try {
    const v = part ? (JSON.parse(decodeURIComponent(part.slice("radio=".length))) as Partial<Station>) : {};
    const channelId = typeof v.channelId === "string" && STATIONS.includes(v.channelId) ? v.channelId : DEFAULT_STATION;
    const volume = typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULT_VOLUME;
    return { channelId, volume };
  } catch {
    return { channelId: DEFAULT_STATION, volume: DEFAULT_VOLUME };
  }
}

const KEY = "world-radio";
const readOn = () => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } };

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
  let state: Station = readStation();
  let on = readOn();
  let loaded = ""; // station currently set as the source
  let mirror = 0;
  let announced = false;
  let pauseTimer = 0;

  // A radio set to volume 0 is as good as off: no music, and nothing to duck the world for.
  const wanted = () => on && state.volume > 0 && level() > 0;
  const volume = () => Math.min(1, state.volume * level());
  const announce = (playing: boolean) => {
    clearTimeout(pauseTimer);
    if (playing === announced) return;
    announced = playing;
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
    if (audio.paused) audio.play().catch(() => {});
  };

  function sync() {
    state = readStation();
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
    pauseTimer = window.setTimeout(() => announce(false), PAUSE_GRACE_MS);
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
  // Touch input only counts as a play-allowed gesture on release, so listen for that as well as the press.
  for (const gesture of ["pointerdown", "pointerup", "click", "keydown"]) window.addEventListener(gesture, tryPlay);
  sync();

  return {
    refresh: sync,
    /** Fetch the station list ahead of the click (hovering or pressing the switch), so play starts inside the gesture. A visitor who never touches the switch never asks SomaFM. */
    warm: () => prime(state.channelId),
    isOn: () => on,
    /** Call from the click that flips the switch: Safari only starts audio inside a gesture. */
    setOn(next: boolean) {
      on = next;
      try { localStorage.setItem(KEY, next ? "on" : "off"); } catch { /* storage unavailable */ }
      prime(state.channelId);
      sync();
    },
  };
}
