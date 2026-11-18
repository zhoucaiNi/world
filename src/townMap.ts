import { FACING, ISLAND_RADIUS, MODULE, PROPS, TOWN, TREES, type Vec2 } from "./town";
import { projectById } from "./projects";

export const VIEW = ISLAND_RADIUS + 1.5; // world units from the map's centre to its edge
const ISLAND = ISLAND_RADIUS + 0.6;

type Paint = CanvasRenderingContext2D;

/** Theme colours live in CSS custom properties on <html>, so the map follows the day/night UI. */
export function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rect(ctx: Paint, [x, z]: Vec2, w: number, d: number, yaw: number) {
  ctx.save();
  ctx.translate(x, z);
  ctx.rotate(-yaw); // world yaw turns +z toward +x; the canvas turns clockwise with y down
  ctx.beginPath();
  ctx.rect(-w / 2, -d / 2, w, d);
  ctx.restore();
}

function circle(ctx: Paint, [x, z]: Vec2, r: number) {
  ctx.beginPath();
  ctx.arc(x, z, r, 0, Math.PI * 2);
}

/** The order the map builds up in. The loading screen reveals one layer at a time. */
export const MAP_LAYERS = ["lawn", "paths", "nature", "buildings"] as const;

/**
 * Everything that doesn't move, cached until the theme or size changes. Draws the first `layers` of
 * MAP_LAYERS, always in the same paint order so a partial map is a subset of the full one.
 */
export function drawTownMap(size: number, scale: number, layers: number = MAP_LAYERS.length) {
  const layer = document.createElement("canvas");
  layer.width = layer.height = size;
  const ctx = layer.getContext("2d")!;
  const hairline = (window.devicePixelRatio || 1) / scale; // 1 CSS px, in world units
  ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2);
  ctx.lineWidth = hairline;
  ctx.strokeStyle = token("--map-edge");

  if (layers > 0) {
    circle(ctx, [0, 0], ISLAND);
    ctx.fillStyle = token("--map-lawn");
    ctx.fill();
  }

  if (layers > 1) {
    ctx.fillStyle = token("--map-path");
    for (const { from, to } of TOWN.paths) ctx.fillRect(from[0], from[1], to[0] - from[0], to[1] - from[1]);
  }

  if (layers > 2) {
    for (const p of TOWN.props) {
      const { collider, map } = PROPS[p.kind];
      if (!collider) continue;
      if ("r" in collider) circle(ctx, p.at, collider.r);
      else rect(ctx, p.at, collider.w, collider.d, p.rot ?? 0);
      ctx.fillStyle = token(map);
      ctx.fill();
      if (p.kind === "fountain") ctx.stroke();
    }
  }

  if (layers > 3) {
    ctx.globalAlpha = parseFloat(token("--map-house-alpha")) || 1;
    for (const h of TOWN.houses) {
      rect(ctx, h.at, h.width * MODULE, h.depth * MODULE, FACING[h.facing].yaw);
      ctx.fillStyle = projectById(h.project).color;
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const { at, facing } = TOWN.windmill;
    rect(ctx, at, MODULE, MODULE, FACING[facing].yaw);
    ctx.fillStyle = token("--map-path");
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(at[0] - 2.2, at[1] - 2.2);
    ctx.lineTo(at[0] + 2.2, at[1] + 2.2);
    ctx.moveTo(at[0] + 2.2, at[1] - 2.2);
    ctx.lineTo(at[0] - 2.2, at[1] + 2.2);
    ctx.lineWidth = hairline * 1.5;
    ctx.stroke();
  }

  if (layers > 2) {
    ctx.fillStyle = token("--map-tree");
    for (const t of TREES) {
      circle(ctx, t.at, 0.38 * t.scale);
      ctx.fill();
    }
  }
  return layer;
}
