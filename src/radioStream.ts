// Follows the radio at radio.zhoucai.me. It writes a cookie on *.zhoucai.me with the station, its volume and
// whether it is playing; when that says "on", this plays the same SomaFM station inside the world.
// A plain <audio> element, as the radio uses: the streams do not send CORS headers, so Web Audio could not read them.

// The radio's lineup. The cookie is readable by every *.zhoucai.me site, so only these ids are ever used in a URL.
const STATIONS = ["groovesalad", "lush", "bossa", "dronezone", "fluid", "deepspaceone", "folkfwd", "secretagent"];
// What the radio itself starts with (its stored defaults), used when it is on but no station or volume was saved.
const DEFAULT_STATION = "groovesalad";
const DEFAULT_VOLUME = 0.7;
const POLL_MS = 2000;
const PAUSE_GRACE_MS = 2500; // a station switch pauses briefly; don't un-duck the world for that

type Shared = { channelId: string; volume: number; on: boolean };

function readCookie(): Shared | null {
  const part = document.cookie.split("; ").find((c) => c.startsWith("radio="));
  if (!part) return null;
  try {
    const v = JSON.parse(decodeURIComponent(part.slice("radio=".length))) as Partial<Shared>;
    const channelId = typeof v.channelId === "string" && STATIONS.includes(v.channelId) ? v.channelId : DEFAULT_STATION;
    const volume = typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULT_VOLUME;
    return { channelId, volume, on: v.on === true };
  } catch {
    return null;
  }
}

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

/** Starts following the cookie. `refresh` re-applies the volume after the user changes the mixer. */
export function followRadio({ level, onPlaying }: Options) {
  const audio = new Audio();
  const streams = new Map<string, string[]>();
  let state: Shared | null = null;
  let loaded = ""; // station currently set as the source
  let mirror = 0;
  let announced = false;
  let pauseTimer = 0;

  // A radio set to volume 0 is as good as off: no music, and nothing to duck the world for.
  const wanted = () => !!state?.on && state.volume > 0 && level() > 0;
  const volume = () => Math.min(1, (state?.volume ?? 0) * level());
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
    const s = state;
    if (!s || !wanted()) return;
    if (loaded !== s.channelId && !setSource(s.channelId)) return;
    if (audio.paused) audio.play().catch(() => {});
  };

  function sync() {
    state = readCookie();
    audio.volume = volume();
    if (state && wanted()) {
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
    const list = state ? streams.get(state.channelId) : undefined;
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

  return { refresh: sync };
}
