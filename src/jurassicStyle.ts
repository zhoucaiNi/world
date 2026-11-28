// One look for every Jurassic mesh: flat-shaded, matte, a few flat palette colours, no painted textures.
// Loaded models (conifers, boulders) are flattened by `flatten`; the procedural plants use the same hexes below.
import { DoubleSide, CanvasTexture, Color, MeshStandardMaterial, type Material, type Texture } from "three";

/** The deliberate set of foliage greens (hue shifts a little per species), plus bark, rock and bone tones. */
export const STYLE = {
  conifer: "#3d7a3f",
  fern: "#5c9a4a",
  cycad: "#4a8a46",
  treeFern: "#69a554",
  horsetail: "#7cab57",
  rachis: "#6e8040",
  bark: "#76593d",
  trunk: "#5b4733",
  rock: "#7a7668",
  mossRock: "#68745a",
  bone: "#e6dcc2",
  amber: "#e0a030",
} as const;

export type StyleRole = keyof typeof STYLE;

const cache = new Map<Material, MeshStandardMaterial>();

/** White copy of a texture that keeps only its alpha, so leaf cards stay cut out but lose their painting. */
function alphaOnly(tex: Texture): Texture | null {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; }
  ctx.putImageData(d, 0, 0);
  const t = new CanvasTexture(c);
  t.flipY = tex.flipY;
  return t;
}

/** Flat, matte, double-sided replacement for a loaded material; `role` picks the palette colour (bark materials always take bark).
 *  Returns the colour as the material colour; callers multiply it by the day/night ratio each frame (see `tinted` in Prehistoric). */
export function flatten(orig: Material, role: StyleRole): { mat: MeshStandardMaterial; base: Color } {
  const o = orig as MeshStandardMaterial;
  const r: StyleRole = /bark/i.test(o.name) ? "bark" : role;
  let mat = cache.get(orig);
  if (!mat) {
    const cutout = !!o.map && (o.alphaTest > 0 || o.transparent);
    mat = new MeshStandardMaterial({
      flatShading: true, roughness: 1, metalness: 0, side: DoubleSide,
      map: cutout ? alphaOnly(o.map!) : null, alphaTest: cutout ? Math.max(o.alphaTest, 0.5) : 0,
    });
    cache.set(orig, mat);
  }
  return { mat, base: new Color(STYLE[r]) };
}
