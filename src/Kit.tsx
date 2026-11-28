import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import {
  CanvasTexture, Color, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3,
  type BufferGeometry, type Material, type MeshStandardMaterial, type Object3D, type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RoofTone } from "./town";
import { WORLD } from "./worldConfig";
import { night } from "./theme";
import { STYLE } from "./jurassicStyle";

const JURASSIC = WORLD.id === "jurassic";

// Models from Kenney's Fantasy Town Kit 2.0 and Nature Kit (CC0, kenney.nl).
// Only the pieces we use are copied into public/models; licences sit beside them.
export const town = (name: string) => `/models/town/${name}.glb`;
export const nature = (name: string) => `/models/nature/${name}.glb`;

/** Maps a model's own material to the one we render with (shared, theme-driven). */
export type Swap = (original: Material, mesh: Mesh) => Material;

type PieceProps = {
  url: string;
  swap?: Swap;
  castShadow?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

/** One placed copy of a kit model. `swap` must be stable (module-level or memoized). */
export function Piece({ url, swap, castShadow = true, ...props }: PieceProps) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const c: Object3D = scene.clone(true);
    c.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = castShadow;
      o.receiveShadow = true;
      if (swap) o.material = Array.isArray(o.material) ? o.material.map((mm) => swap(mm, o)) : swap(o.material, o);
    });
    return c;
  }, [scene, swap, castShadow]);
  return <primitive object={object} {...props} />;
}

/** Translate, turn about y, then scale. Chain with `.multiply` for nested placements. */
export function trs(x: number, y: number, z: number, yaw = 0, scale = 1): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
    new Vector3(scale, scale, scale),
  );
}

/** One copy of a kit model in a Batch: its model, how its materials map, and where it sits. */
export type Placement = { url: string; swap: Swap; matrix: Matrix4 };

/** Merges geometries that share a material, keeping only the attributes they all have. */
function mergeShared(geos: BufferGeometry[]): BufferGeometry {
  const keep = Object.keys(geos[0].attributes).filter((a) => geos.every((g) => a in g.attributes));
  const mixed = geos.some((g) => g.index) && geos.some((g) => !g.index);
  const ready = geos.map((g) => {
    const h = mixed && g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(h.attributes)) if (!keep.includes(a)) h.deleteAttribute(a);
    h.morphAttributes = {}; // a few CC0 models carry unused morph targets; a merged static mesh has no influences to drive them
    return h;
  });
  const merged = mergeGeometries(ready);
  if (!merged) throw new Error("Batch: kit geometries could not be merged");
  return merged;
}

/** Many static kit models drawn as one mesh per material, instead of one mesh per model part.
 *  `items` must be stable (memoized), since merging runs again whenever it changes. */
export function Batch({ items }: { items: Placement[] }) {
  const urls = useMemo(() => [...new Set(items.map((p) => p.url))], [items]);
  const gltfs = useGLTF(urls);
  const meshes = useMemo(() => {
    const scenes = new Map(urls.map((u, k) => [u, gltfs[k].scene]));
    const buckets = new Map<Material, BufferGeometry[]>();
    for (const { url, swap, matrix } of items) {
      const scene = scenes.get(url)!;
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        if (Array.isArray(o.material)) throw new Error(`Batch: ${url} has a multi-material mesh`);
        const material = swap(o.material, o);
        const geometry = o.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(matrix, o.matrixWorld));
        const list = buckets.get(material);
        if (list) list.push(geometry);
        else buckets.set(material, [geometry]);
      });
    }
    return [...buckets].map(([material, geos]) => ({ material, geometry: mergeShared(geos) }));
  }, [urls, gltfs, items]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m, k) => (
        <mesh key={k} geometry={m.geometry} material={m.material} castShadow receiveShadow />
      ))}
    </>
  );
}

// The town kit's colormap is a grid of 8 x 4 gradient swatches (64 x 128 px each on the 512 px
// texture). These are the swatches the house pieces use, re-hued for the pastel town; each keeps
// its original light-to-dark gradient.
export type Swatch = [col: number, row: number, hex: string];
const TOWN_RECOLOR: Swatch[] = [
  [1, 2, "#f6ead8"], // wall plaster (also lantern bodies, chimneys) -> cream, tinted per house
  [4, 3, "#c49a78"], // timber frame -> soft wood
  [5, 3, "#d4b896"], // timber wall panels and doors -> light oak, so the per-house pastel tint warms it instead of reddening it
  [1, 3, "#d9917a"], // roof tiles -> terracotta
  [7, 3, "#b8aca2"], // chimney cap / lantern top
];

// The park's visitor buildings: warm poured concrete, dark tinted glass for the upper-floor panels and doors,
// thatch-brown domes for the terracotta roofs, and a teal roof for the sage ones.
const JURASSIC_RECOLOR: Swatch[] = [
  [1, 2, "#e6dcc6"],
  [4, 3, "#6a5a48"],
  [5, 3, "#7f9a92"],
  [1, 3, "#a2814e"],
  [7, 3, "#8e8a7c"],
];
const KIT_RECOLOR = JURASSIC ? JURASSIC_RECOLOR : TOWN_RECOLOR;

/** The roof-tile swatch per roof tone; terracotta is the default map. */
export const ROOF_SWATCH: Record<RoofTone, Swatch[]> = { terracotta: [], sage: [[1, 3, JURASSIC ? "#3f8a82" : "#8db5a6"]] };

// Props share the house swatches for other parts: (1,2) is also rock and fountain stone, (1,3) the
// green awning and banner, (0,3) the red awning and banner, (3,3) the hedge leaves.
export const PROP_SWATCHES: Swatch[] = JURASSIC ? [
  [1, 2, "#cdc6b4"],
  [1, 3, "#6f8f5c"], // canvas awnings: olive and khaki
  [0, 3, "#c9a45f"],
  [3, 3, "#8fb98a"],
] : [
  [1, 2, "#d3c9bc"],
  [1, 3, "#8db5a6"],
  [0, 3, "#d98276"],
  [3, 3, "#c5ddc2"], // recolorKit writes this hex's linear value as sRGB bytes, so this is pre-brightened to land on the leaf sage #8fb98a
];

/** A mask over the kit colormap that is white only in one swatch: used as an emissive map so
 *  just that part of a model glows (the lantern glass). */
export function kitSwatchMask(source: Texture, col: number, row: number): Texture {
  const img = source.image as { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect((col * img.width) / 8, (row * img.height) / 4, img.width / 8, img.height / 4);
  const tex = new CanvasTexture(canvas);
  tex.flipY = source.flipY;
  tex.colorSpace = source.colorSpace;
  return tex;
}

/** Returns a recoloured copy of the kit's colormap texture; `extra` swatches override the defaults. */
export function recolorKit(source: Texture, extra: Swatch[] = []): Texture {
  const img = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const cw = img.width / 8;
  const ch = img.height / 4;
  const swatches = new Map([...KIT_RECOLOR, ...extra].map((s) => [`${s[0]},${s[1]}`, s]));
  for (const [col, row, hex] of swatches.values()) {
    const data = ctx.getImageData(col * cw, row * ch, cw, ch);
    const px = data.data;
    // Keep each pixel's brightness relative to the swatch's average, applied to the new hue.
    let mean = 0;
    for (let k = 0; k < px.length; k += 4) mean += px[k] + px[k + 1] + px[k + 2];
    mean /= px.length / 4;
    const target = new Color(hex);
    for (let k = 0; k < px.length; k += 4) {
      const f = (px[k] + px[k + 1] + px[k + 2]) / mean;
      px[k] = Math.min(255, target.r * 255 * f);
      px[k + 1] = Math.min(255, target.g * 255 * f);
      px[k + 2] = Math.min(255, target.b * 255 * f);
    }
    ctx.putImageData(data, col * cw, row * ch);
  }
  const tex = new CanvasTexture(canvas);
  tex.flipY = source.flipY;
  tex.colorSpace = source.colorSpace;
  tex.magFilter = source.magFilter;
  tex.minFilter = source.minFilter;
  tex.needsUpdate = true;
  return tex;
}

type Spot = [x: number, z: number, rotation: number, scale: number];

/** Many copies of one small model (grass, flowers) as instanced meshes: one draw call per part. */
export function Scatter({ url, spots, swap }: { url: string; spots: Spot[]; swap: Swap }) {
  const { scene } = useGLTF(url);
  const parts = useMemo(() => {
    const out: { geometry: BufferGeometry; material: Material; local: Matrix4 }[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (o instanceof Mesh && !Array.isArray(o.material)) {
        out.push({ geometry: o.geometry, material: swap(o.material, o), local: o.matrixWorld.clone() });
      }
    });
    return out;
  }, [scene, swap]);
  const refs = useRef<(InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const up = new Vector3(0, 1, 0);
    parts.forEach((p, i) => {
      const im = refs.current[i];
      if (!im) return;
      spots.forEach(([x, z, rot, sc], k) => {
        m.compose(new Vector3(x, 0, z), q.setFromAxisAngle(up, rot), s.setScalar(sc)).multiply(p.local);
        im.setMatrixAt(k, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });
  }, [parts, spots]);
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          args={[p.geometry, p.material, spots.length]}
          receiveShadow
          userData={{ noHalftone: true }}
        />
      ))}
    </>
  );
}

// Jurassic props come from their own models (poly.pizza, CC0), each with its own materials. Every original
// material is cloned once, made matte, and darkened toward night by the shared `night` value.
const NIGHT_TINT = new Color("#7682ad");
const AMBER = new Color(STYLE.amber);
const jurassicMaterials = new Map<Material, Material>();

const JEEP_BODY = new Color("#c2a14e"); // the tour jeep's white paint
const FLAG = new Color("#c9b27a"); // the watchtowers' red pennants

export const jurassicSwap: Swap = (orig, mesh) => {
  let m = jurassicMaterials.get(orig);
  if (!m) {
    m = orig.clone();
    const std = m as MeshStandardMaterial;
    std.metalness = 0;
    std.roughness = 1;
    std.flatShading = true; // one flat-shaded look for every Jurassic prop (see jurassicStyle.ts)
    const base = std.color.clone();
    if (orig.name === "Pink") { // the crystal model is magenta (colour and vertex colours); ours is amber
      std.vertexColors = false;
      base.copy(AMBER);
    }
    else if (orig.name === "White" && mesh.name.startsWith("SUV_")) base.copy(JEEP_BODY);
    else if (orig.name === "cloth") base.set("#7f8a5c"); // the field tent: olive canvas, not toy red
    else if (mesh.name === "Barrel") { // the atlas paints the drums blue and brown; make them olive-drab field drums
      std.map = null;
      base.set("#6b7650");
    } else if (mesh.name.startsWith("Environment_LargeBones")) { // fossil ribs: ivory, not the atlas's salmon pink
      std.map = null;
      base.set(STYLE.bone);
    } else if (mesh.name.startsWith("Rock_")) { // the rocks' atlas is rust orange; make them weathered grey-brown stone
      std.map = null;
      std.flatShading = true;
      base.set(STYLE.rock);
    }
    else if (orig.name === "Main" && mesh.name.startsWith("WatchTower")) base.copy(FLAG);
    const mix = new Color();
    m.onBeforeRender = () => std.color.copy(mix.copy(base).lerp(NIGHT_TINT, night.value * 0.55));
    jurassicMaterials.set(orig, m);
  }
  return m;
};
