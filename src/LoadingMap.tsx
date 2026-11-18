import { useEffect, useRef } from "react";
import { TOWN } from "./town";
import { MAP_LAYERS, VIEW, drawTownMap, token } from "./townMap";

const GRID = 12;
const FADE_MS = 240;
// Progress at which each map layer (lawn, paths, nature, buildings, markers) unlocks.
const UNLOCK = [0, 0.22, 0.45, 0.68, 0.88];
// Chunks all land by here, so the lawn fills before the later layers arrive.
const CHUNKS_DONE_AT = 0.8;

/** Chunks that touch the map circle, nearest the fountain first, each ring swept clockwise from the top. */
const SPIRAL = (() => {
  const mid = (GRID - 1) / 2;
  const cells: { col: number; row: number; ring: number; angle: number }[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const dx = col - mid;
      const dy = row - mid;
      if (Math.hypot(Math.abs(dx) - 0.5, Math.abs(dy) - 0.5) > GRID / 2) continue;
      const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
      cells.push({ col, row, ring: Math.max(Math.abs(dx), Math.abs(dy)), angle });
    }
  }
  return cells.sort((a, b) => a.ring - b.ring || a.angle - b.angle);
})();

function withMarkers(base: HTMLCanvasElement, scale: number) {
  const layer = document.createElement("canvas");
  layer.width = layer.height = base.width;
  const ctx = layer.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  const dot = (at: [number, number], r: number, fill: string, edge?: string) => {
    ctx.beginPath();
    ctx.arc(base.width / 2 + at[0] * scale, base.width / 2 + at[1] * scale, r * dpr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = edge;
      ctx.stroke();
    }
  };
  for (const at of TOWN.lanterns) dot(at, 1.4, token("--map-lamp"));
  dot(TOWN.campfire, 2.6, token("--map-fire"));
  dot(TOWN.dog, 3.2, token("--map-dog"), token("--map-dog-edge"));
  return layer;
}

/** The town map filling in chunk by chunk, like a world-loading screen. `progress` is 0 to 1. */
export default function LoadingMap({ progress, done }: { progress: number; done: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const target = useRef({ progress, done });
  target.current = { progress, done };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shownAt = new Array<number>(SPIRAL.length).fill(-1);
    let layers: HTMLCanvasElement[] = [];
    let layersKey = "";
    let ink = { empty: "" };
    let shown = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const size = Math.round(canvas.clientWidth * dpr);
      if (size) {
        if (canvas.width !== size) canvas.width = canvas.height = size;
        const scale = size / 2 / VIEW;
        const key = `${document.documentElement.dataset.time}:${size}`;
        if (key !== layersKey) {
          layers = MAP_LAYERS.map((_, i) => drawTownMap(size, scale, i + 1));
          layers.push(withMarkers(layers[layers.length - 1], scale));
          ink = { empty: token("--map-edge") };
          layersKey = key;
        }

        // Ease toward the real progress, never back, so the reveal keeps moving between big steps.
        const { progress: p, done: finishing } = target.current;
        const goal = finishing ? 1 : Math.min(p, 0.99);
        if (goal > shown) {
          const creep = ((finishing ? 1.5 : 0.04) * dt) / 1000;
          shown = Math.min(goal, shown + Math.max((goal - shown) * dt * 0.006, creep));
        }
        if (labelRef.current) labelRef.current.textContent = `${Math.round(shown * 100)}%`;

        const stage = UNLOCK.filter((u) => shown >= u).length - 1;
        const revealed = Math.ceil(Math.min(1, shown / CHUNKS_DONE_AT) * SPIRAL.length - 1e-6);
        const cell = size / GRID;
        const gap = Math.max(1, dpr);
        ctx.clearRect(0, 0, size, size);
        for (let i = 0; i < SPIRAL.length; i++) {
          const { col, row } = SPIRAL[i];
          const x = col * cell;
          const y = row * cell;
          if (i >= revealed) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = ink.empty;
            ctx.fillRect(x + gap, y + gap, cell - gap * 2, cell - gap * 2);
            continue;
          }
          if (shownAt[i] < 0) shownAt[i] = now;
          ctx.globalAlpha = still ? 1 : Math.min(1, (now - shownAt[i]) / FADE_MS);
          ctx.drawImage(layers[stage], x, y, cell, cell, x, y, cell, cell);
        }
        ctx.globalAlpha = 1;
      }
      const settled = shown >= 1 && shownAt.every((t) => t >= 0 && now - t > FADE_MS);
      if (!settled) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="veil-map" />
      <p className="veil-pct">
        Loading <span ref={labelRef}>0%</span>
      </p>
    </>
  );
}
