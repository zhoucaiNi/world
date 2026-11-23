// The state shared with the radio site (radio.zhoucai.me) lives in cookies on *.zhoucai.me, because localStorage is per
// origin. `radio` is {channelId, volume, on}: the radio site writes station and volume, both sites write `on`.
// `radio-world=<tabId>` is a short-lived heartbeat that says "a world tab is playing the music right now".
export type Shared = { channelId: string; volume: number; on: boolean };

const COOKIE_NAME = "radio";
const WORLD_NAME = "radio-world";
const MAX_AGE = 60 * 60 * 24 * 365; // seconds; Safari caps cookies written from script at about 7 days
const HEARTBEAT_AGE = 5;

// The radio's lineup. The cookie is readable by every *.zhoucai.me site, so only these ids are ever used in a URL.
const STATIONS = ["groovesalad", "lush", "bossa", "dronezone", "fluid", "deepspaceone", "folkfwd", "secretagent"];

// Same attributes as the radio site writes: with any difference the browser would keep a second cookie.
function cookieString(name: string, value: string, maxAge: number, host: string, secure: boolean): string {
  const shared = host === "zhoucai.me" || host.endsWith(".zhoucai.me");
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    // On localhost or a preview host there is no parent domain to share with, so it stays host-only.
    ...(shared ? ["Domain=.zhoucai.me"] : []),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

const set = (name: string, value: string, maxAge: number) => {
  try {
    document.cookie = cookieString(name, value, maxAge, location.hostname, location.protocol === "https:");
  } catch { /* cookies blocked */ }
};

const find = (name: string) => document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.slice(name.length + 1);

function parse(): Record<string, unknown> {
  const raw = find(COOKIE_NAME);
  if (raw === undefined) return {};
  try {
    const v: unknown = JSON.parse(decodeURIComponent(raw));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Each field of the cookie that is valid; the rest are left out, so the caller falls back per field. */
export function readShared(): Partial<Shared> {
  const v = parse();
  const out: Partial<Shared> = {};
  if (typeof v.channelId === "string" && STATIONS.includes(v.channelId)) out.channelId = v.channelId;
  if (typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1) out.volume = v.volume;
  if (v.on === true) out.on = true;
  return out;
}

/** The world only ever writes `on`: read the cookie, change that one field, write it back. */
export function writeOn(on: boolean) {
  set(COOKIE_NAME, encodeURIComponent(JSON.stringify({ ...parse(), on })), MAX_AGE);
}

export const setHeartbeat = (id: string) => set(WORLD_NAME, id, HEARTBEAT_AGE);
/** Removes the heartbeat, unless it is another tab's. */
export function clearHeartbeat(id: string) {
  if (find(WORLD_NAME) === id) set(WORLD_NAME, id, 0);
}
/** Whether a world tab other than `id` is playing the music right now. */
export const otherWorldPlaying = (id: string) => {
  const v = find(WORLD_NAME);
  return v !== undefined && v !== id;
};
