import type { Project } from "./projects";

// World units; x east, z south (so -z is north, up on the minimap).

export const MODULE = 2.5; // world units per kit cell
export const ISLAND_RADIUS = 28; // walkable radius

export type Vec2 = [x: number, z: number];
export type Facing = "n" | "e" | "s" | "w";

/** `yaw` turns a model's local +z (its front) to face `dir`. */
export const FACING: Record<Facing, { yaw: number; dir: Vec2 }> = {
  n: { yaw: Math.PI, dir: [0, -1] },
  e: { yaw: Math.PI / 2, dir: [1, 0] },
  s: { yaw: 0, dir: [0, 1] },
  w: { yaw: -Math.PI / 2, dir: [-1, 0] },
};

export type RoofTone = "terracotta" | "sage";

export type House = {
  project: Project["id"];
  at: Vec2;
  facing: Facing; // the door's side
  width: number; // cells along the front
  depth: 2; // cells front to back; the gable roof spans exactly two rows
  floors: 1 | 2;
  roof: RoofTone;
  sign: "left" | "right"; // which side of the door the signpost stands, seen from the doorstep
};

export type PropKind =
  | "stall-red" | "stall-green" | "bench" | "stool" | "cart" | "cart-high" | "fence" | "fence-gate"
  | "hedge" | "rock-large" | "rock-wide" | "rock-small" | "log" | "log-stack" | "fountain"
  | "pumpkin" | "melon" | "carrot" | "pot-large" | "pot-small" | "lily-small" | "lily-large"
  | "mushroom-tan" | "mushroom-red" | "stump-old" | "stump-round" | "tent" | "wheel";

type Footprint = { r: number } | { w: number; d: number };

/** How each kind of prop is drawn and collides. `offset` is the footprint centre in model units, for
 *  kit pieces that sit on a cell edge, so a prop's `at` is always the middle of what you see. */
export const PROPS: Record<PropKind, {
  url: string;
  scale: number;
  offset?: Vec2;
  collider: Footprint | null;
  kit: "town" | "nature";
  map: string; // minimap colour (CSS custom property)
}> = {
  "stall-red": { url: "/models/town/stall-red.glb", scale: MODULE, collider: { w: 2.3, d: 2.3 }, kit: "town", map: "--map-red" },
  "stall-green": { url: "/models/town/stall-green.glb", scale: MODULE, collider: { w: 2.3, d: 2.3 }, kit: "town", map: "--map-sage" },
  bench: { url: "/models/town/stall-bench.glb", scale: MODULE, collider: { w: 0.65, d: 2.35 }, kit: "town", map: "--map-wood" },
  stool: { url: "/models/town/stall-stool.glb", scale: MODULE, collider: { r: 0.35 }, kit: "town", map: "--map-wood" },
  cart: { url: "/models/town/cart.glb", scale: MODULE, collider: { w: 1.6, d: 3.3 }, kit: "town", map: "--map-wood" },
  "cart-high": { url: "/models/town/cart-high.glb", scale: MODULE, collider: { w: 1.6, d: 3.3 }, kit: "town", map: "--map-wood" },
  fence: { url: "/models/town/fence.glb", scale: MODULE, offset: [0.46, 0], collider: { w: 0.2, d: 2.5 }, kit: "town", map: "--map-wood" },
  "fence-gate": { url: "/models/town/fence-gate.glb", scale: MODULE, offset: [0.46, 0], collider: { w: 0.2, d: 2.5 }, kit: "town", map: "--map-wood" },
  hedge: { url: "/models/town/hedge.glb", scale: MODULE, offset: [0.375, 0], collider: { w: 0.63, d: 2.5 }, kit: "town", map: "--map-tree" },
  "rock-large": { url: "/models/town/rock-large.glb", scale: 2.4, collider: { r: 1.8 }, kit: "town", map: "--map-rock" },
  "rock-wide": { url: "/models/town/rock-wide.glb", scale: 2.2, collider: { w: 2.2, d: 3.2 }, kit: "town", map: "--map-rock" },
  "rock-small": { url: "/models/town/rock-small.glb", scale: 1.8, offset: [0, -0.11], collider: { r: 1 }, kit: "town", map: "--map-rock" },
  log: { url: "/models/nature/log_large.glb", scale: 1.5, collider: { w: 1.5, d: 0.8 }, kit: "nature", map: "--map-wood" },
  "log-stack": { url: "/models/nature/log_stack.glb", scale: 3, collider: { w: 1.2, d: 2.1 }, kit: "nature", map: "--map-wood" },
  fountain: { url: "/models/town/fountain-round-detail.glb", scale: MODULE, collider: { r: 2.6 }, kit: "town", map: "--map-water" },
  pumpkin: { url: "/models/nature/crop_pumpkin.glb", scale: 1.5, collider: null, kit: "nature", map: "--map-red" },
  melon: { url: "/models/nature/crop_melon.glb", scale: 1.5, collider: null, kit: "nature", map: "--map-sage" },
  carrot: { url: "/models/nature/crop_carrot.glb", scale: 1.4, collider: null, kit: "nature", map: "--map-red" },
  "pot-large": { url: "/models/nature/pot_large.glb", scale: 2.4, collider: { r: 0.4 }, kit: "nature", map: "--map-wood" },
  "pot-small": { url: "/models/nature/pot_small.glb", scale: 2.6, collider: { r: 0.3 }, kit: "nature", map: "--map-wood" },
  "lily-small": { url: "/models/nature/lily_small.glb", scale: 4.2, collider: null, kit: "nature", map: "--map-tree" },
  "lily-large": { url: "/models/nature/lily_large.glb", scale: 3.8, collider: null, kit: "nature", map: "--map-tree" },
  "mushroom-tan": { url: "/models/nature/mushroom_tanGroup.glb", scale: 4, collider: null, kit: "nature", map: "--map-wood" },
  "mushroom-red": { url: "/models/nature/mushroom_redTall.glb", scale: 4, collider: null, kit: "nature", map: "--map-red" },
  "stump-old": { url: "/models/nature/stump_old.glb", scale: 3, collider: { r: 0.55 }, kit: "nature", map: "--map-wood" },
  "stump-round": { url: "/models/nature/stump_roundDetailed.glb", scale: 3, collider: { r: 0.55 }, kit: "nature", map: "--map-wood" },
  tent: { url: "/models/nature/tent_detailedOpen.glb", scale: 3.4, collider: { w: 2.6, d: 2.0 }, kit: "nature", map: "--map-red" },
  wheel: { url: "/models/town/wheel.glb", scale: 2, collider: null, kit: "town", map: "--map-wood" },
};

export type Prop = { kind: PropKind; at: Vec2; rot?: number; y?: number }; // `y` lifts a prop onto a counter or the water
export type Rect = { from: Vec2; to: Vec2 }; // axis-aligned, `from` is the north-west corner

/** A model's local point (x right, z toward its front) placed at `at` and turned by `yaw`, in world space. */
export function toWorld([x, z]: Vec2, yaw: number, [lx, lz]: Vec2): Vec2 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

const DOOR_STEP = 1.6;

export function doorPoint(h: House): Vec2 {
  const [dx, dz] = FACING[h.facing].dir;
  const out = (h.depth * MODULE) / 2 + DOOR_STEP;
  return [h.at[0] + dx * out, h.at[1] + dz * out];
}

/** In the house's own frame, where local +x is the right side seen from the doorstep. */
export function signLocal(h: House): Vec2 {
  return [h.sign === "right" ? 1.9 : -1.9, (h.depth * MODULE) / 2 + 0.9];
}

const PLAZA = 3.5 * MODULE; // half-width of the 7 x 7 cell plaza

// Paves from 0.25 under the wall (so no lawn shows at the threshold) out to the plaza's edge.
function doorstep(h: House): Rect {
  const { yaw, dir } = FACING[h.facing];
  const front = (h.depth * MODULE) / 2;
  const reach = -(h.at[0] * dir[0] + h.at[1] * dir[1]) - PLAZA; // house centre to the plaza edge
  const a = toWorld(h.at, yaw, [-MODULE / 2, front - 0.25]);
  const b = toWorld(h.at, yaw, [MODULE / 2, reach]);
  return { from: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], to: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
}

const around = ([x, z]: Vec2, r: number, a: number): Vec2 => [x + Math.cos(a) * r, z + Math.sin(a) * r];

const HOUSES: House[] = [
  { project: "studio", at: [-6.25, -16], facing: "s", width: 3, depth: 2, floors: 2, roof: "terracotta", sign: "right" },
  { project: "reading", at: [6.25, -16], facing: "s", width: 3, depth: 2, floors: 2, roof: "sage", sign: "left" },
  { project: "radio", at: [-16, 0], facing: "e", width: 3, depth: 2, floors: 2, roof: "sage", sign: "right" },
  { project: "home", at: [16, 0], facing: "w", width: 3, depth: 2, floors: 2, roof: "terracotta", sign: "right" },
];

const CAMPFIRE: Vec2 = [12.5, 12.5];
// The two far diagonals, so the benches frame the fountain as you walk in from the lane.
const DIAGONALS = [-3, -1].map((k) => (k * Math.PI) / 4);

// Seats at the benches' centres. The bench's long axis runs tangent to the fountain, so its seat faces
// the fountain along (-cos a, -sin a); `yaw` is the camera yaw looking that way (fwd = (-sin yaw, -cos yaw)).
// `stand` is 3.14 from the fountain: clear of both its collider (3.0 with the player radius) and the bench's (3.275).
export const BENCHES = DIAGONALS.map((a) => ({
  at: around([0, 0], 4, a),
  yaw: Math.atan2(Math.cos(a), Math.sin(a)),
  stand: around([0, 0], 3.14, a),
}));

const WATER_Y = 0.37; // the fountain's water surface (0.14 x 2.5) plus a hair

const COUNTER_GOODS: Prop[] = [
  { kind: "pumpkin", at: [-5.9, 5.3], y: 0.92, rot: 0.3 },
  { kind: "pumpkin", at: [-5.1, 6.1], y: 0.92, rot: 1.4 },
  { kind: "pumpkin", at: [-5.9, 6.8], y: 0.92, rot: 2.6 },
  { kind: "melon", at: [5.1, 5.4], y: 0.92, rot: 0.8 },
  { kind: "carrot", at: [5.9, 6.0], y: 0.92, rot: 2.2 },
  { kind: "carrot", at: [5.1, 6.4], y: 0.92, rot: 4 },
  { kind: "melon", at: [5.9, 6.9], y: 0.92, rot: 5.1 },
];

// A large pot on one side of the door and a small one on the other, clear of the 2.5-wide doorstep slab's centre.
function doorPots(h: House): Prop[] {
  const { yaw } = FACING[h.facing];
  const side = h.sign === "right" ? -1 : 1;
  const front = (h.depth * MODULE) / 2 + 0.45;
  return [
    { kind: "pot-large", at: toWorld(h.at, yaw, [side * 1.1, front]) },
    { kind: "pot-small", at: toWorld(h.at, yaw, [-side * 1.1, front]), rot: 0.7 },
  ];
}

const PROP_LIST: Prop[] = [
  { kind: "fountain", at: [0, 0] },
  // Benches face the fountain on diagonals, leaving the four walkways open.
  ...DIAGONALS.map((a): Prop => ({ kind: "bench", at: around([0, 0], 4, a), rot: -a })),
  { kind: "stall-red", at: [-5.5, 6] },
  { kind: "stall-green", at: [5.5, 6] },
  { kind: "cart", at: [-8, 5], rot: 0.2 },
  { kind: "log-stack", at: [8, 5] },
  // The gap at z 12 holds the lane lanterns.
  ...[-1.65, 1.65].flatMap((x) => [10.25, 13.75, 17.25].map((z): Prop => ({ kind: "hedge", at: [x, z] }))),
  // The log seats leave the side facing the plaza open.
  ...[-1, 1, 3].map((k): Prop => {
    const a = (k * Math.PI) / 4;
    return { kind: "log", at: around(CAMPFIRE, 2, a), rot: -a - Math.PI / 2 };
  }),
  { kind: "stool", at: around(CAMPFIRE, 2, Math.PI) },
  ...[-1, 1].flatMap((side): Prop[] => [
    { kind: "fence", at: [side * 21.25, -2.5] },
    { kind: "fence-gate", at: [side * 21.25, 0] },
    { kind: "fence", at: [side * 21.25, 2.5] },
    { kind: "fence", at: [side * 19.95, -3.75], rot: Math.PI / 2 },
    { kind: "fence", at: [side * 19.95, 3.75], rot: Math.PI / 2 },
  ]),
  { kind: "cart-high", at: [19.9, -1.6] },
  { kind: "rock-large", at: [-12.5, -9.5], rot: 0.4 },
  { kind: "rock-small", at: [-10.6, -7.4], rot: 1.2 },
  { kind: "rock-wide", at: [-14.6, -7.6], rot: 0.6 },
  { kind: "rock-large", at: [12.5, -9.5], rot: -0.4 },
  { kind: "rock-small", at: [10.6, -7.4], rot: -1.2 },
  { kind: "rock-wide", at: [14.6, -7.6], rot: -0.6 },
  { kind: "rock-large", at: [-23, 9], rot: 0.9 },
  { kind: "rock-small", at: [-21.2, 11.6], rot: 2.1 },
  { kind: "rock-wide", at: [23.5, 7.5], rot: 1.1 },
  { kind: "rock-large", at: [6, -23.5], rot: 2 },
  { kind: "rock-small", at: [8.6, -22.6], rot: 0.3 },
  { kind: "rock-wide", at: [-7, 23.8], rot: 0.4 },
  // Goods on the stall counters (their tops sit at 0.92) and spilling off the cart.
  ...COUNTER_GOODS,
  { kind: "pumpkin", at: [-9.7, 4.1], rot: 0.5 },
  { kind: "melon", at: [-9.9, 5.3], rot: 2 },
  { kind: "carrot", at: [-9.6, 6.4], rot: 1 },
  { kind: "wheel", at: [-9.4, 2.9], rot: 1.2 },
  ...HOUSES.flatMap(doorPots),
  { kind: "lily-large", at: around([0, 0], 1.25, 0.6), y: WATER_Y, rot: 0.4 },
  { kind: "lily-small", at: around([0, 0], 1.3, 2.5), y: WATER_Y, rot: 1.9 },
  { kind: "lily-large", at: around([0, 0], 1.2, 4.3), y: WATER_Y, rot: 3.3 },
  { kind: "tent", at: around(CAMPFIRE, 4.8, Math.PI / 4), rot: -3 * Math.PI / 4 },
];

export const TOWN = {
  spawn: [0, 17.5] as Vec2,
  dog: [0.3, 13.5] as Vec2,
  houses: HOUSES,
  props: PROP_LIST,
  // At most 8: with the campfire that is the scene's 9-point-light budget.
  // Four light the square's corners; the campfire has its own glow.
  lanterns: [[0, -10], [-7.6, -7.6], [7.6, -7.6], [-7.6, 7.6], [7.6, 7.6], [-1.9, 12], [1.9, 12]] as Vec2[],
  paths: [
    { from: [-PLAZA, -PLAZA], to: [PLAZA, PLAZA] }, // plaza
    { from: [-MODULE / 2, PLAZA], to: [MODULE / 2, PLAZA + 4 * MODULE] }, // lane to the spawn
    ...HOUSES.map(doorstep),
  ] as Rect[],
  campfire: CAMPFIRE,
  windmill: { at: [-17, -16] as Vec2, facing: "s" as Facing },
};

export type Collider =
  | { kind: "circle"; at: Vec2; r: number }
  | { kind: "rect"; at: Vec2; w: number; d: number; rot: number };

function footprint(at: Vec2, shape: Footprint, rot: number): Collider {
  return "r" in shape ? { kind: "circle", at, r: shape.r } : { kind: "rect", at, w: shape.w, d: shape.d, rot };
}

const BUILT: Collider[] = [
  ...TOWN.houses.flatMap((h): Collider[] => {
    const yaw = FACING[h.facing].yaw;
    return [
      { kind: "rect", at: h.at, w: h.width * MODULE + 0.3, d: h.depth * MODULE + 0.3, rot: yaw },
      { kind: "circle", at: toWorld(h.at, yaw, signLocal(h)), r: 0.25 },
    ];
  }),
  ...TOWN.props.flatMap((p) => {
    const shape = PROPS[p.kind].collider;
    return shape ? [footprint(p.at, shape, p.rot ?? 0)] : [];
  }),
  ...TOWN.lanterns.map((at): Collider => ({ kind: "circle", at, r: 0.3 })),
  { kind: "circle", at: TOWN.campfire, r: 1 },
  { kind: "circle", at: TOWN.windmill.at, r: 1.9 },
];

function contains(c: Collider, x: number, z: number, pad: number) {
  const dx = x - c.at[0];
  const dz = z - c.at[1];
  if (c.kind === "circle") return Math.hypot(dx, dz) < c.r + pad;
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  return Math.abs(dx * cos - dz * sin) < c.w / 2 + pad && Math.abs(dx * sin + dz * cos) < c.d / 2 + pad;
}

export function onPath(x: number, z: number, pad: number) {
  return TOWN.paths.some(({ from, to }) => x > from[0] - pad && x < to[0] + pad && z > from[1] - pad && z < to[1] + pad);
}

/** Deterministic pseudo-random numbers, so the town looks the same on every visit. */
export function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export type Tree = { at: Vec2; type: string; scale: number; turn: number };
const TREE_TYPES = ["tree_default", "tree_oak", "tree_detailed", "tree_pineRoundA"];

export const TREES: Tree[] = (() => {
  const out: Tree[] = [];
  const rnd = seeded(7);
  for (let tries = 0; out.length < 36 && tries < 5000; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 18.5 + rnd() * (ISLAND_RADIUS - 19);
    const at: Vec2 = [Math.cos(a) * r, Math.sin(a) * r];
    const type = TREE_TYPES[Math.floor(rnd() * TREE_TYPES.length)];
    const scale = 1.8 + rnd() * 1.2;
    const turn = rnd() * Math.PI * 2;
    const nearWindmill = Math.hypot(at[0] - TOWN.windmill.at[0], at[1] - TOWN.windmill.at[1]) < 5.5; // its sails sweep 3.9 out
    const crowded = out.some((t) => Math.hypot(t.at[0] - at[0], t.at[1] - at[1]) < 2.2);
    if (!nearWindmill && !crowded && !onPath(...at, 1.5) && !BUILT.some((c) => contains(c, ...at, 1.2))) {
      out.push({ at, type, scale, turn });
    }
  }
  return out;
})();

const treeColliders = TREES.map((t): Collider => ({ kind: "circle", at: t.at, r: 0.45 }));

// Placed after the trees, since they sit beside them, and pushed into the same list so Props renders them.
const woodland = (() => {
  const out: Prop[] = [];
  const kinds: PropKind[] = ["mushroom-tan", "stump-old", "mushroom-red", "stump-round", "mushroom-tan", "mushroom-red", "stump-old"];
  const rnd = seeded(23);
  for (const t of TREES) {
    if (out.length >= kinds.length) break;
    const mates = TREES.filter((o) => o !== t && Math.hypot(o.at[0] - t.at[0], o.at[1] - t.at[1]) < 5).length;
    if (mates < 2 || rnd() < 0.5) continue;
    const a = rnd() * Math.PI * 2;
    const at = around(t.at, 0.9 + t.scale * 0.3, a);
    const tooClose = out.some((o) => Math.hypot(o.at[0] - at[0], o.at[1] - at[1]) < 4);
    if (!tooClose && Math.hypot(...at) < ISLAND_RADIUS - 1 && !onPath(...at, 1) && !BUILT.some((c) => contains(c, ...at, 0.7))
      && !treeColliders.some((c) => contains(c, ...at, 0.65))) {
      out.push({ kind: kinds[out.length], at, rot: rnd() * Math.PI * 2 });
    }
  }
  return out;
})();
PROP_LIST.push(...woodland);

export const colliders: Collider[] = [
  ...BUILT,
  ...woodland.flatMap((p) => { const shape = PROPS[p.kind].collider; return shape ? [footprint(p.at, shape, p.rot ?? 0)] : []; }),
  ...treeColliders,
];

export function blocked(x: number, z: number, pad: number) {
  return colliders.some((c) => contains(c, x, z, pad));
}

export function keepClear(pos: { x: number; z: number }, radius: number) {
  const r = Math.hypot(pos.x, pos.z);
  if (r > ISLAND_RADIUS) {
    pos.x *= ISLAND_RADIUS / r;
    pos.z *= ISLAND_RADIUS / r;
  }
  for (const c of colliders) {
    const dx = pos.x - c.at[0];
    const dz = pos.z - c.at[1];
    if (c.kind === "circle") {
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 0) {
        pos.x = c.at[0] + (dx / d) * min;
        pos.z = c.at[1] + (dz / d) * min;
      }
      continue;
    }
    const cos = Math.cos(c.rot);
    const sin = Math.sin(c.rot);
    let lx = dx * cos - dz * sin;
    let lz = dx * sin + dz * cos;
    const hx = c.w / 2 + radius;
    const hz = c.d / 2 + radius;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
    // Out through the nearest side, so walkers slide along walls.
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = Math.sign(lx || 1) * hx;
    else lz = Math.sign(lz || 1) * hz;
    pos.x = c.at[0] + lx * cos + lz * sin;
    pos.z = c.at[1] - lx * sin + lz * cos;
  }
}

// Written every frame by Player and Dog, read by the minimap.
export const live = {
  player: { x: TOWN.spawn[0], z: TOWN.spawn[1], yaw: 0 },
  dog: { x: TOWN.dog[0], z: TOWN.dog[1] },
};
