// The Jurassic plant layers (used only when WORLD.flora is set): a ground layer of ferns, a mid layer of
// cycads, tree ferns and horsetails, and a canopy of conifers. Cycads, tree ferns, horsetails and the
// low fern clumps are built here from curved blades (the same Parts as Flora.tsx); ferns, conifers and
// boulders are shrunken Quaternius Stylized Nature MegaKit models (CC0).
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, BufferGeometry, Color, DoubleSide, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Material, type Object3D } from "three";
import { trs, type Swap } from "./Kit";
import { Parts, type Spot } from "./Flora";
import { grassMaterial, wind } from "./Grass";
import { LodInstances, type LodLevel, type LodPart } from "./lod";
import { POND, POND_ROCKS, TREES, pondRadius, seeded } from "./town";
import { WORLD } from "./worldConfig";
import { STYLE, flatten, type StyleRole } from "./jurassicStyle";
import { mixPair, night, palette } from "./theme";

type Rgb = [number, number, number];
const STEPS = 12;

/** Point on, and tilt of, a blade's centreline at fraction `t`; the same integration as Parts.blade. */
function arc(at: Vector3, yaw: number, lift: number, curl: number, length: number, t: number) {
  const out = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const p = at.clone();
  for (let i = 0; i < STEPS; i++) {
    const k = Math.min(1, Math.max(0, STEPS * t - i)) * length / STEPS;
    const a = lift - curl * (i / STEPS);
    p.addScaledVector(out, Math.cos(a) * k).y += Math.sin(a) * k;
  }
  return { p, tilt: lift - curl * Math.min(STEPS - 1, Math.floor(STEPS * t)) / STEPS };
}

/** Colour ramp from a hex: `shade` 0..1 runs dark (base) to light (tip); linear rgb. */
function tone(hex: string, dark = 0.6, yellow = 0.12) {
  const c = new Color(hex);
  return (shade: number): Rgb => {
    const s = dark + (1 - dark) * shade;
    return [c.r * s * (1 + yellow * shade), c.g * s, c.b * s * (1 - yellow * shade)];
  };
}

type Frond = {
  at: Vector3; yaw: number; lift: number; curl: number; length: number;
  pairs: number; leafLen: number; leafW: number; leafLift: number; leafCurl: number; sweep: number;
  color: (shade: number) => Rgb; rachisW?: number;
};

/** A pinnate frond: a thin curved rachis with a row of leaflets down both sides, longest mid-frond. */
function frond(parts: Parts, f: Frond) {
  const rachis = tone(STYLE.rachis, 0.7, 0);
  parts.blade({
    at: f.at, yaw: f.yaw, lift: f.lift, curl: f.curl, length: f.length, width: f.rachisW ?? 0.035,
    profile: [[0, 1], [0.5, 0.8], [0.98, 0.35]], upBlend: 0.6, color: (t) => rachis(t),
  });
  for (let i = 0; i < f.pairs; i++) {
    const t = 0.1 + 0.88 * i / (f.pairs - 1);
    const { p, tilt } = arc(f.at, f.yaw, f.lift, f.curl, f.length, t);
    const len = f.leafLen * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)));
    for (const side of [-1, 1]) {
      parts.blade({
        at: p, yaw: f.yaw + side * (f.sweep - 0.45 * t), lift: f.leafLift + 0.35 * tilt, curl: f.leafCurl,
        length: len, width: f.leafW, profile: [[0, 0.55], [0.45, 1], [0.95, 0.3]], upBlend: 0.6,
        color: (s) => f.color(0.25 + 0.75 * t * 0.6 + 0.4 * s),
      });
    }
  }
}

/** A ringed trunk: `rings` bands whose radius alternates, so it reads as scaly leaf bases. `bulge` fattens the middle. */
function trunk(parts: Parts, o: { height: number; r0: number; r1: number; rings: number; bulge: number; color: (s: number) => Rgb }) {
  const sides = 8;
  const rows: number[][] = [];
  for (let i = 0; i <= o.rings; i++) {
    const f = i / o.rings;
    const band = i % 2 ? 1.12 : 0.92;
    const r = (o.r0 + (o.r1 - o.r0) * f) * (1 + o.bulge * Math.sin(Math.PI * f)) * band;
    const shade = (i % 2 ? 0.55 : 0.3) + 0.2 * f;
    const row: number[] = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const n = new Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize();
      row.push(parts.vertex(new Vector3(Math.cos(a) * r, o.height * f - 0.05, Math.sin(a) * r), n, o.color(shade)));
    }
    rows.push(row);
  }
  for (let i = 0; i < o.rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % sides], c = rows[i + 1][j], d = rows[i + 1][(j + 1) % sides];
      parts.idx.push(a, c, b, b, c, d);
    }
  }
}

const bark = tone(STYLE.bark, 0.3, 0);

/** Short fat trunk, a crown of stiff, upswept fronds. The most common Jurassic tree. */
function cycadGeometry(lod = 0): BufferGeometry {
  const rnd = seeded(101);
  const L = [{ n: [9, 6, 3], pairs: 11, rings: 8 }, { n: [7, 4, 2], pairs: 7, rings: 5 }, { n: [5, 3, 1], pairs: 4, rings: 3 }][lod];
  const parts = new Parts();
  const green = tone(STYLE.cycad, 0.45);
  trunk(parts, { height: 0.55, r0: 0.2, r1: 0.16, rings: L.rings, bulge: 0.15, color: bark });
  const tiers = [{ n: L.n[0], lift: 0.4, len: 1.5 }, { n: L.n[1], lift: 0.95, len: 1.25 }, { n: L.n[2], lift: 1.3, len: 0.9 }];
  tiers.forEach((tier, k) => {
    for (let i = 0; i < tier.n; i++) {
      frond(parts, {
        at: new Vector3(0, 0.5 + 0.03 * k, 0), yaw: ((i + rnd() * 0.5) / tier.n) * Math.PI * 2,
        lift: tier.lift + (rnd() - 0.5) * 0.25, curl: 0.75, length: tier.len * (0.9 + rnd() * 0.2),
        pairs: L.pairs, leafLen: 0.3, leafW: 0.05 * (11 / L.pairs) ** 0.75, leafLift: 0.3, leafCurl: 0.15, sweep: 1.25, color: green,
      });
    }
  });
  return parts.geometry();
}

/** Tall slim trunk topped by a loose crown of long, drooping fronds. */
function treeFernGeometry(lod = 0): BufferGeometry {
  const rnd = seeded(211);
  const L = [{ n: [7, 4], pairs: 12, rings: 22 }, { n: [5, 3], pairs: 8, rings: 10 }, { n: [4, 2], pairs: 4, rings: 6 }][lod];
  const parts = new Parts();
  const green = tone(STYLE.treeFern, 0.5);
  const height = 2.8;
  trunk(parts, { height, r0: 0.12, r1: 0.075, rings: L.rings, bulge: 0.04, color: tone(STYLE.trunk, 0.3, 0) });
  const tiers = [{ n: L.n[0], lift: 0.5, len: 1.9 }, { n: L.n[1], lift: 1.0, len: 1.5 }];
  tiers.forEach((tier) => {
    for (let i = 0; i < tier.n; i++) {
      frond(parts, {
        at: new Vector3(0, height - 0.08, 0), yaw: ((i + rnd() * 0.6) / tier.n) * Math.PI * 2,
        lift: tier.lift + (rnd() - 0.5) * 0.2, curl: 1.5, length: tier.len * (0.9 + rnd() * 0.2),
        pairs: L.pairs, leafLen: 0.34, leafW: 0.055 * (12 / L.pairs) ** 0.75, leafLift: -0.1, leafCurl: 0.5, sweep: 1.3, color: green,
      });
    }
  });
  return parts.geometry();
}

/** A cluster of jointed, upright stalks with a whorl of thin needles at each node. */
function horsetailGeometry(lod = 0): BufferGeometry {
  const rnd = seeded(307);
  const L = [{ n: 8, joints: 8, spokes: 6, sides: 5 }, { n: 6, joints: 6, spokes: 4, sides: 4 }, { n: 4, joints: 4, spokes: 3, sides: 3 }][lod];
  const parts = new Parts();
  const stalk = tone(STYLE.horsetail, 0.5, 0);
  const needle = tone(STYLE.horsetail, 0.7, 0.1);
  const n = L.n;
  for (let s = 0; s < n; s++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.22;
    const base = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const lean = new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.12 + rnd() * 0.18);
    const height = 0.9 + rnd() * 0.9;
    const joints = L.joints;
    const sides = L.sides;
    const at = (f: number) => base.clone().addScaledVector(lean, f * f).setY(height * f);
    let prev: number[] | null = null;
    for (let j = 0; j <= joints; j++) {
      const f = j / joints;
      const p = at(f);
      const w = 0.016 * (1 - 0.5 * f) * (j % 2 ? 1 : 1.3);
      const row = Array.from({ length: sides }, (_, k) => {
        const t = (k / sides) * Math.PI * 2;
        return parts.vertex(p.clone().add(new Vector3(Math.cos(t) * w, 0, Math.sin(t) * w)), new Vector3(Math.cos(t), 0.3, Math.sin(t)).normalize(), stalk(0.3 + 0.7 * f * (j % 2 ? 0.8 : 0.4)));
      });
      if (prev) for (let k = 0; k < sides; k++) {
        const b = prev[k], c = prev[(k + 1) % sides], d = row[k], e = row[(k + 1) % sides];
        parts.idx.push(b, d, c, c, d, e);
      }
      prev = row;
      if (j >= 2 && j < joints) {
        const spokes = L.spokes;
        const len = 0.17 * (1 - 0.45 * f);
        for (let k = 0; k < spokes; k++) {
          parts.blade({
            at: p, yaw: ((k + rnd() * 0.4 + (j % 2) * 0.5) / spokes) * Math.PI * 2, lift: 0.45, curl: 0.55, length: len, width: 0.012,
            profile: [[0, 1], [1, 0.3]], upBlend: 0.7, color: (t) => needle(0.3 + 0.7 * t),
          });
        }
      }
    }
  }
  return parts.geometry();
}

/** A low rosette of arching fronds, replacing the lawn's grass clumps. */
function fernClumpGeometry(lod = 0): BufferGeometry {
  const rnd = seeded(401);
  const L = [{ n: 6, pairs: 7 }, { n: 5, pairs: 4 }, { n: 4, pairs: 2 }][lod];
  const parts = new Parts();
  const green = tone(STYLE.fern, 0.5);
  const n = L.n;
  for (let i = 0; i < n; i++) {
    frond(parts, {
      at: new Vector3(0, 0, 0), yaw: ((i + rnd() * 0.6) / n) * Math.PI * 2, lift: 0.75 + rnd() * 0.3, curl: 1.3,
      length: 0.45 + rnd() * 0.2, pairs: L.pairs, leafLen: 0.15, leafW: 0.045 * (7 / L.pairs) ** 0.75, leafLift: 0.05, leafCurl: 0.3, sweep: 1.3,
      color: green, rachisW: 0.02,
    });
  }
  return parts.geometry();
}

/** Multiplies every flora material, recoloured each frame so the plants dim with the lawn at night. */
const LAWN_DAY = new Color(palette.lawn[0]);
const ratio = new Color();
const registry: { mat: MeshStandardMaterial; base: Color }[] = [];

function tinted(mat: MeshStandardMaterial, base = "#ffffff") {
  registry.push({ mat, base: new Color(base) });
  return mat;
}

function useFloraTint() {
  useFrame(() => {
    mixPair(palette.lawn, night.value, ratio);
    ratio.set(ratio.r / LAWN_DAY.r, ratio.g / LAWN_DAY.g, ratio.b / LAWN_DAY.b);
    for (const { mat, base } of registry) mat.color.copy(base).multiply(ratio);
  });
}

/** Swap for a model batch: each original material becomes one flat palette-coloured material (see jurassicStyle.ts). */
function modelSwap(role: StyleRole): Swap {
  const cache = new Map<Material, Material>();
  return (orig) => {
    let m = cache.get(orig);
    if (!m) {
      const f = flatten(orig, role);
      m = tinted(f.mat, "#" + f.base.getHexString());
      cache.set(orig, m);
    }
    return m;
  };
}

export const FLORA_URLS = {
  conifers: ["conifer-narrow", "conifer-tall", "conifer-a"].map((n) => `/models/jurassic/flora/${n}.glb`),
  // The same conifers with the trunk and branches (the bulk of the triangles) simplified; the leaf cards are kept.
  coniferLod: ["conifer-narrow", "conifer-tall", "conifer-a"].map((n) => `/models/jurassic/flora-lod/${n}-lod1.glb`),
  boulders: ["boulder-a", "boulder-b"].map((n) => `/models/jurassic/flora/${n}.glb`),
};

// Level borders (m) and where nothing is drawn any more: just past where the fog is opaque.
const CULL = WORLD.atmosphere.fog.far + 2;
const SMALL_BANDS = [12, 26]; // ferns, horsetails: full < 12 m, reduced < 26 m, then the cheapest
const MID_BANDS = [14, 28]; // cycads, tree ferns
const TREE_BANDS = [15, 30];
const UP = new Vector3(0, 1, 0);

/** The three detail levels of a procedural plant, built once and shared by every layer that uses it. */
const lodCache = new Map<(lod: number) => BufferGeometry, BufferGeometry[]>();
function lodGeometries(build: (lod: number) => BufferGeometry) {
  let g = lodCache.get(build);
  if (!g) lodCache.set(build, (g = [0, 1, 2].map(build)));
  return g;
}

/** Instanced plants that drop to simpler geometry with distance and are not drawn when out of view or in the fog. */
function LodPlants({ spots, material, build, tint, bands, thin }: {
  spots: Spot[]; material: MeshStandardMaterial; build: (lod: number) => BufferGeometry; tint: number; bands: number[]; thin?: number;
}) {
  const levels = useMemo((): LodLevel[] => lodGeometries(build).map((geometry, l) => ({ groups: [[{ geometry, material }]], until: bands[l] ?? Infinity, every: l === 2 ? thin : undefined })), [build, material, bands, thin]);
  const { matrices, colors } = useMemo(() => {
    const matrices = new Float32Array(spots.length * 16);
    const colors = new Float32Array(spots.length * 3);
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3();
    spots.forEach(([x, z, rot, s], i) => {
      m.compose(p.set(x, 0, z), q.setFromAxisAngle(UP, rot), sc.setScalar(s)).toArray(matrices, i * 16);
      colors.fill(1 - tint + tint * (0.5 + 0.5 * Math.sin(x * 1.3 + z * 0.9)), i * 3, i * 3 + 3);
    });
    return { matrices, colors };
  }, [spots, tint]);
  useFrame((state) => { wind.value = state.clock.elapsedTime; });
  return <LodInstances levels={levels} matrices={matrices} colors={colors} cull={CULL} />;
}

type ModelPart = LodPart & { bark: boolean };

/** One part per mesh of a loaded model, with its node transform baked in and its material mapped by `swap`. */
function modelParts(scene: Object3D, swap: Swap): ModelPart[] {
  scene.updateMatrixWorld(true);
  const out: ModelPart[] = [];
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const material = o.material as Material;
    out.push({ geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material: swap(material, o), bark: /bark/i.test(material.name) });
  });
  return out;
}

const impostorMaterial = tinted(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: DoubleSide }));

/** The far version of a conifer: a thin trunk and three stacked cones fitted to the model's leaf volume (about 40 triangles). */
function conifer3Geometry(parts: ModelPart[]): BufferGeometry {
  const box = new Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); if (!p.bark) box.union(p.geometry.boundingBox!); }
  const y0 = box.min.y, y1 = box.max.y;
  const R = (box.max.x - box.min.x + box.max.z - box.min.z) / 4;
  const cx = (box.max.x + box.min.x) / 2, cz = (box.max.z + box.min.z) / 2;
  const g = new Parts();
  const leaf = new Color(STYLE.conifer), wood = new Color(STYLE.bark);
  const col = (c: Color): [number, number, number] => [c.r, c.g, c.b];
  const ring = (y: number, r: number, c: Color, sides: number) => Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return g.vertex(new Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r), new Vector3(Math.cos(a), 0.4, Math.sin(a)).normalize(), col(c));
  });
  const trunkBase = ring(-0.2, 0.3, wood, 5), trunkTop = ring(y1 * 0.9, 0.08, wood, 5);
  for (let k = 0; k < 5; k++) g.idx.push(trunkBase[k], trunkTop[k], trunkBase[(k + 1) % 5], trunkBase[(k + 1) % 5], trunkTop[k], trunkTop[(k + 1) % 5]);
  const H = y1 - y0;
  [[0, 1, 0.55], [0.3, 0.72, 0.5], [0.58, 0.45, 0.42]].forEach(([at, rk, hk]) => {
    const base = ring(y0 + at * H, R * rk, leaf, 7);
    const apex = g.vertex(new Vector3(cx, y0 + Math.min(1, at + hk) * H, cz), UP, col(leaf));
    for (let k = 0; k < 7; k++) g.idx.push(base[k], apex, base[(k + 1) % 7]);
  });
  return g.geometry();
}

/** The conifer canopy: the town's tree positions, with tall narrow conifers and a few broad ones. Three levels: the model
 *  (< 15 m), the model with a simplified trunk (< 30 m), and trunk + cones. Trees cast shadows at every level. */
export function JurassicTrees() {
  const cfg = WORLD.flora!;
  const swap = useMemo(() => modelSwap("conifer"), []);
  const full = useGLTF(FLORA_URLS.conifers);
  const simple = useGLTF(FLORA_URLS.coniferLod);
  const { levels, matrices, kinds } = useMemo(() => {
    const parts = full.map((g) => modelParts(g.scene, swap));
    const lod1 = simple.map((g, k) => {
      const bark = parts[k].find((p) => p.bark)!;
      return [...modelParts(g.scene, swap).filter((p) => p.bark).map((p) => ({ geometry: p.geometry, material: bark.material })), ...parts[k].filter((p) => !p.bark)];
    });
    const far = parts.map((p) => [{ geometry: conifer3Geometry(p), material: impostorMaterial }]);
    const levels: LodLevel[] = [
      { groups: parts, until: TREE_BANDS[0] },
      { groups: lod1, until: TREE_BANDS[1] },
      { groups: far, until: Infinity },
    ];
    const rnd = seeded(5);
    const matrices = new Float32Array(TREES.length * 16);
    const kinds = new Uint8Array(TREES.length);
    TREES.forEach(({ at, scale, turn }, i) => {
      const broad = rnd() < cfg.broadShare;
      kinds[i] = broad ? 2 : rnd() < 0.5 ? 0 : 1;
      trs(at[0], 0, at[1], turn, scale * cfg.treeScale * (broad ? 0.8 : 1)).toArray(matrices, i * 16);
    });
    return { levels, matrices, kinds };
  }, [full, simple, swap, cfg]);
  useFloraTint();
  return <LodInstances levels={levels} matrices={matrices} kinds={kinds} cull={CULL} pad={7} always={14} castShadow halftone />;
}

type Rock = { x: number; y: number; z: number; turn: number; scale: number };

/** Moss-tinted boulders: both models in one set, culled by view and fog distance. */
function LodRocks({ rocks, swap }: { rocks: Rock[]; swap: Swap }) {
  const gltfs = useGLTF(FLORA_URLS.boulders);
  const levels = useMemo((): LodLevel[] => [{ groups: gltfs.map((g) => modelParts(g.scene, swap)), until: Infinity }], [gltfs, swap]);
  const { matrices, kinds } = useMemo(() => {
    const matrices = new Float32Array(rocks.length * 16);
    const kinds = new Uint8Array(rocks.length);
    rocks.forEach((r, i) => { trs(r.x, r.y, r.z, r.turn, r.scale).toArray(matrices, i * 16); kinds[i] = i % gltfs.length; });
    return { matrices, kinds };
  }, [rocks, gltfs]);
  return <LodInstances levels={levels} matrices={matrices} kinds={kinds} cull={CULL} pad={5} always={10} castShadow halftone />;
}

export type Layout = Record<"ferns" | "fernModels" | "cycads" | "treeFerns" | "horsetails" | "boulders", Spot[]>;

/** Ground ferns, then the cycad / tree fern / horsetail mid layer, then moss-tinted boulders. */
export function JurassicLawn({ layout }: { layout: Layout }) {
  const mats = useMemo(() => ({
    fern: tinted(grassMaterial(0.25, undefined, "-fern")),
    cycad: tinted(grassMaterial(0.05, undefined, "-cycad")),
    treeFern: tinted(grassMaterial(0.02, undefined, "-treefern")),
    horsetail: tinted(grassMaterial(0.03, undefined, "-horsetail")),
  }), []);
  const rockSwap = useMemo(() => modelSwap("mossRock"), []);
  const rocks = useMemo(() => layout.boulders.map(([x, z, turn, scale]): Rock => ({ x, y: -0.1, z, turn, scale })), [layout]);
  const groundFerns = useMemo(() => [...layout.ferns, ...layout.fernModels], [layout]);
  useFloraTint();
  return (
    <>
      <LodPlants spots={groundFerns} material={mats.fern} build={fernClumpGeometry} tint={0.2} bands={SMALL_BANDS} thin={2} />
      <LodPlants spots={layout.cycads} material={mats.cycad} build={cycadGeometry} tint={0.15} bands={MID_BANDS} />
      <LodPlants spots={layout.treeFerns} material={mats.treeFern} build={treeFernGeometry} tint={0.15} bands={MID_BANDS} />
      <LodPlants spots={layout.horsetails} material={mats.horsetail} build={horsetailGeometry} tint={0.15} bands={SMALL_BANDS} />
      <LodRocks rocks={rocks} swap={rockSwap} />
    </>
  );
}


/** The watering hole's rim: reeds (horsetail clusters) at the water's edge, ferns on the bank and big mossy rocks. */
export function PondRim() {
  const mats = useMemo(() => ({
    reed: tinted(grassMaterial(0.03, undefined, "-horsetail")),
    fern: tinted(grassMaterial(0.25, undefined, "-fern")),
  }), []);
  const { reeds, ferns, models } = useMemo(() => {
    const rnd = seeded(83);
    const at = (a: number, d: number): [number, number] => [POND.at[0] + Math.cos(a) * (pondRadius(a) + d), POND.at[1] + Math.sin(a) * (pondRadius(a) + d)];
    const clear = (x: number, z: number, pad: number) => POND_ROCKS.every((k) => Math.hypot(k.at[0] - x, k.at[1] - z) > k.r + pad);
    const reeds: Spot[] = [];
    for (let i = 0; i < 70 && reeds.length < 15; i++) {
      const a = rnd() * Math.PI * 2;
      const [x, z] = at(a, -0.25 + rnd() * 0.9);
      if (Math.abs(x) < 1.7 && z > 0) continue; // keep the way from the lane to the water open
      if (clear(x, z, 0.3)) reeds.push([x, z, rnd() * 6.28, 0.7 + rnd() * 0.6]);
    }
    const ferns: Spot[] = [];
    const models: Spot[] = [];
    for (let i = 0; i < 400 && (ferns.length < 40 || models.length < 14); i++) {
      const a = rnd() * Math.PI * 2;
      const [x, z] = at(a, 0.7 + rnd() * 2.8);
      if (Math.abs(x) < 1.7 && z > 0) continue;
      if (!clear(x, z, 0.5)) continue;
      if (i % 3 && ferns.length < 40) ferns.push([x, z, rnd() * 6.28, 1.6 + rnd() * 1.2]);
      else if (models.length < 14) models.push([x, z, rnd() * 6.28, 0.7 + rnd() * 0.8]);
    }
    return { reeds, ferns, models };
  }, []);
  const rockSwap = useMemo(() => modelSwap("mossRock"), []);
  const rocks = useMemo(() => POND_ROCKS.map((k): Rock => ({ x: k.at[0], y: -0.15, z: k.at[1], turn: k.turn, scale: k.scale })), []);
  const bankFerns = useMemo(() => [...ferns, ...models], [ferns, models]);
  return (
    <>
      <LodPlants spots={reeds} material={mats.reed} build={horsetailGeometry} tint={0.15} bands={SMALL_BANDS} />
      <LodPlants spots={bankFerns} material={mats.fern} build={fernClumpGeometry} tint={0.2} bands={SMALL_BANDS} thin={2} />
      <LodRocks rocks={rocks} swap={rockSwap} />
    </>
  );
}
