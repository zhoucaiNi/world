import { useEffect, useRef } from "react";
import { TOWN, live, type Vec2 } from "./town";
import { night } from "./theme";
import { WORLD } from "./worldConfig";
import { VIEW, drawTownMap, token } from "./townMap";

export default function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let layer: HTMLCanvasElement | null = null;
    let layerKey = "";
    let ink = { lamp: "", fire: "", dog: "", dogEdge: "", player: "", card: "" };
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const size = Math.round(canvas.clientWidth * dpr);
      if (!size) return;
      if (canvas.width !== size) canvas.width = canvas.height = size;
      const scale = size / 2 / VIEW;
      const key = `${document.documentElement.dataset.time}:${size}`;
      if (key !== layerKey || !layer) {
        layer = drawTownMap(size, scale);
        layerKey = key;
        ink = {
          lamp: token("--map-lamp"), fire: token("--map-fire"), dog: token("--map-dog"),
          dogEdge: token("--map-dog-edge"), player: token("--map-player"), card: token("--card"),
        };
      }
      const t = night.value;
      const toPx = ([x, z]: Vec2): Vec2 => [size / 2 + x * scale, size / 2 + z * scale];

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(layer, 0, 0);

      const glow = (at: Vec2, radius: number, color: string, alpha: number) => {
        const [x, y] = toPx(at);
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * scale);
        g.addColorStop(0, color);
        g.addColorStop(1, `${color}00`); // same hue at zero alpha, so the edge doesn't fade through black
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.fillRect(x - radius * scale, y - radius * scale, radius * 2 * scale, radius * 2 * scale);
        ctx.globalAlpha = 1;
      };
      const dot = (at: Vec2, r: number, fill: string, edge?: string) => {
        const [x, y] = toPx(at);
        ctx.beginPath();
        ctx.arc(x, y, r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        if (edge) {
          ctx.lineWidth = 1.5 * dpr;
          ctx.strokeStyle = edge;
          ctx.stroke();
        }
      };
      const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 90);
      if (t > 0.01) {
        for (const at of TOWN.lanterns) glow(at, 2.6, ink.lamp, 0.45 * t);
        glow(TOWN.campfire, 4, ink.fire, 0.55 * t * flicker);
      }
      ctx.globalAlpha = 0.6 + 0.4 * t;
      for (const at of TOWN.lanterns) dot(at, 1.4, ink.lamp);
      ctx.globalAlpha = 1;
      dot(TOWN.campfire, 2.6, ink.fire);

      dot([live.dog.x, live.dog.z], 3.2, ink.dog, ink.dogEdge);

      // yaw 0 looks north, up the map.
      const [px, py] = toPx([live.player.x, live.player.z]);
      ctx.setTransform(dpr, 0, 0, dpr, px, py);
      ctx.rotate(-live.player.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(3.2, 3.2);
      ctx.lineTo(0, 1.6);
      ctx.lineTo(-3.2, 3.2);
      ctx.closePath();
      ctx.fillStyle = ink.player;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink.card;
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="minimap" role="img" aria-label={WORLD.text.mapLabel} />;
}
