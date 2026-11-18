import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, useProgress } from "@react-three/drei";
import World from "./World";
import Halftone from "./Halftone";
import Minimap from "./Minimap";
import LoadingMap from "./LoadingMap";
import { projects, type Project } from "./projects";
import { credits, creditsIntro, type Inline } from "./credits";
import { CHANNELS, getVolumes, isMuted, setMuted, setVolume, type Channel } from "./Sound";
import { TOWN } from "./town";
import Joystick, { isTouchScreen } from "./Joystick";
import { useAim } from "./aim";
import { seat, type SeatPrompt } from "./Player";
import { currentHour, nightAt } from "./theme";

const TOUCH = isTouchScreen();
const MAX_DPR = Math.min(window.devicePixelRatio || 1, 2);

// Speaker with 0 = X, 1 = one wave, 2 = two waves.
function SoundIcon({ level }: { level: 0 | 1 | 2 }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {level === 0 && <path d="m16 9 5 6m0-6-5 6" />}
      {level >= 1 && <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
      {level === 2 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  );
}

const VOLUME_LABELS: Record<Channel, string> = { master: "Master", music: "Music", fire: "Campfire", fountain: "Fountain", crickets: "Crickets", birds: "Birds" };

const TIPS = [
  "Click to look around, WASD or arrows to walk. Stand at a door to open a project.",
  "Every building is a project.",
];

function CreditLine({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? p : (
          <a key={i} href={p.href} target="_blank" rel="noreferrer">
            {p.text}
          </a>
        ),
      )}
    </>
  );
}

// Same clock and night threshold the world uses (see syncUiTheme).
function Clock() {
  const read = () => {
    const h = currentHour();
    const d = new Date(2000, 0, 1, Math.floor(h), Math.floor((h % 1) * 60));
    return { text: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), moon: nightAt(h) > 0.5 };
  };
  const [t, setT] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setT(read()), 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock" aria-label={t.text} aria-live="off">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {t.moon ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      <span>{t.text}</span>
    </div>
  );
}

function Veil({ done, progress }: { done: boolean; progress: number }) {
  return (
    <div className={`veil${done ? " done" : ""}`} aria-hidden={done}>
      <LoadingMap progress={progress / 100} done={done} />
      <p>{TIPS[0]}</p>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [nearby, setNearby] = useState<Project | null>(null);
  const [seatPrompt, setSeatPrompt] = useState<SeatPrompt>(null);
  const [listView, setListView] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [mixOpen, setMixOpen] = useState(false);
  const [volumes, setVolumesState] = useState(getVolumes);
  const mixWrap = useRef<HTMLDivElement>(null);
  const [dpr, setDpr] = useState(MAX_DPR);
  const aim = useAim();

  // Lift the veil once every model and texture has loaded, not on a timer. Models stream in
  // waves, so wait for loading to stay finished briefly, and keep a short minimum so it never flashes.
  const { active, progress } = useProgress();
  const [minShown, setMinShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const sync = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", sync);
    return () => document.removeEventListener("pointerlockchange", sync);
  }, []);

  useEffect(() => {
    if (!mixOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMixOpen(false); };
    // Outside press closes; presses on the icon button or panel are inside the wrap, so toggle still works.
    const away = (e: PointerEvent) => { if (!mixWrap.current?.contains(e.target as Node)) setMixOpen(false); };
    window.addEventListener("keydown", esc);
    window.addEventListener("pointerdown", away);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("pointerdown", away); };
  }, [mixOpen]);

  // The mouse is usually locked to the view at a door, so Enter opens the project.
  useEffect(() => {
    if (!nearby) return;
    const open = (e: KeyboardEvent) => {
      if (e.key === "Enter") window.open(nearby.url, "_blank", "noreferrer");
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, [nearby]);
  useEffect(() => {
    if (ready || !minShown || active || progress < 100) return;
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, [ready, minShown, active, progress]);

  return (
    <>
      <div className="canvas-wrap">
        <Canvas shadows dpr={dpr} camera={{ fov: 70, position: [TOWN.spawn[0], 1.2, TOWN.spawn[1]] }}>
          {/* Drop resolution on devices that can't hold the frame rate (phones), restore it when they
              can. Only measured after loading, so the hitches while models stream in don't count. */}
          {ready && (
            <PerformanceMonitor
              onDecline={() => setDpr((d) => Math.max(1, d - 0.5))}
              onIncline={() => setDpr((d) => Math.min(MAX_DPR, d + 0.5))}
            />
          )}
          <Suspense fallback={null}>
            <World onNearby={setNearby} onSeat={setSeatPrompt} />
            <Halftone />
          </Suspense>
        </Canvas>
      </div>
      <div className="vignette" />
      {!listView && <Minimap />}
      {locked && (
        <div className={`crosshair${aim !== "off" ? " aimed" : ""}`}>
          <i className="dot" />
          <svg className="heart" viewBox="-0.6 -0.6 1.2 1.2" aria-hidden>
            <path d="M0 0.5C-0.15 0.35-0.5 0.1-0.5-0.15C-0.5-0.42-0.2-0.5 0-0.28C0.2-0.5 0.5-0.42 0.5-0.15C0.5 0.1 0.15 0.35 0 0.5Z" />
          </svg>
        </div>
      )}
      {(locked || TOUCH) && (
        <div className={`pet-prompt${aim === "aimed" && !nearby && !listView ? " show" : ""}`} aria-hidden>
          {locked ? "Click to pet" : "Tap to pet"}
        </div>
      )}

      {ready && !nearby && seatPrompt !== "stand" && <div className="hint">{TOUCH ? "Drag to look · use the stick to walk" : "Click to look around · WASD or arrows to walk · Esc frees the mouse"}</div>}
      {ready && TOUCH && !listView && <Joystick />}
      {ready && seatPrompt && !listView && !nearby && (
        <button className="toggle seat-prompt" onClick={(e) => { e.currentTarget.blur(); seat.toggle(); }}>
          {seatPrompt === "sit" ? "Sit" : "Stand"} · E
        </button>
      )}
      {nearby && (
        <div className="panel">
          <h2>{nearby.title}</h2>
          <p>{nearby.blurb}</p>
          <a href={nearby.url} target="_blank" rel="noreferrer">
            Open ↗ <kbd>Enter</kbd>
          </a>
        </div>
      )}

      {ready && !listView && <Clock />}
      <div className="top-buttons">
        <div className="mix-wrap" ref={mixWrap}>
          <button className="toggle icon-btn" aria-label="Sound settings" title="Sound settings" aria-expanded={mixOpen} aria-controls="mix" onClick={() => setMixOpen((o) => !o)}>
            <SoundIcon level={muted || volumes.master === 0 ? 0 : volumes.master < 0.5 ? 1 : 2} />
          </button>
          {mixOpen && (
            // Keys here must not reach the window-level WASD/arrow/Space/Enter handlers.
            <div id="mix" className={muted ? "mix is-muted" : "mix"} role="group" aria-label="Sound settings" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setMixOpen(false); }} onKeyUp={(e) => e.stopPropagation()}>
              <div className="mix-row">
                <span>Sound</span>
                <button type="button" role="switch" aria-checked={!muted} aria-label="Sound" className="switch" onClick={() => { setMuted(!muted); setMutedState(!muted); }} />
              </div>
              {CHANNELS.map((c) => (
                <label key={c}>
                  <span>{VOLUME_LABELS[c]}</span>
                  <input
                    type="range" disabled={muted} min={0} max={100} value={Math.round(volumes[c] * 100)}
                    onChange={(e) => { setVolume(c, +e.target.value / 100); setVolumesState(getVolumes()); }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        <button className="toggle" onClick={() => setListView((v) => !v)}>
          {listView ? "Back to world" : "List view"}
        </button>
      </div>
      {listView && (
        <div className="list">
          <ul className="projects">
            {projects.map((p) => (
              <li key={p.id}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.title}
                </a>
                <p>{p.blurb}</p>
              </li>
            ))}
          </ul>
          <section className="credits" aria-labelledby="credits-title">
            <h2 id="credits-title">Credits</h2>
            <p>{creditsIntro}</p>
            {credits.map((s) => (
              <div key={s.title}>
                <h3>{s.title}</h3>
                <ul>
                  {s.lines.map((line, i) => (
                    <li key={i}>
                      <CreditLine parts={line} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}

      <Veil done={ready} progress={progress} />
    </>
  );
}
