import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Box3, Color, BufferAttribute, type BufferGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, MeshStandardMaterial, type Object3D, Vector3,
} from "three";
import { mixPair, night, palette } from "./theme";
import { nature, trs } from "./Kit";
import { TREES, seeded } from "./town";

const TREE_TYPES = ["tree_default", "tree_oak", "tree_detailed", "tree_pineRoundA"];
const TREE_URLS = TREE_TYPES.map(nature);
const PERCH_TREES = 18; // trees that offer perches, spread round the island
const START_TREES = 9; // of those, the ones that begin with a bird (two of them with a pair)
const PAIRED = [0, 6];
const MAX_AIRBORNE = 2;
const HOP = { min: 3, max: 18 }; // how far a flight may go, metres
const WAIT = { min: 15, max: 40 }; // seconds a bird sits between takeoffs

const TONES = ["birdSage", "birdWing", "birdBeak", "birdSlate", "birdCream", "birdBiscuit", "birdTaupe"] as const;
const tones = TONES.map(() => new Color());
const HALFTONE_SCALE = 3.5; // dots this much finer than on trees: the birds are about 0.3 m long

// Each model paints its atlas in a handful of flat colours; each is swapped for a palette tone.
const BODY_MODELS = [
  { url: "/models/birds/jay.glb", length: 0.32, yaw: -Math.PI / 2, // modelled facing +x
    swap: [[[79, 168, 0], 0], [[60, 131, 168], 1], [[181, 111, 49], 2], [[25, 25, 25], 3], [[57, 57, 57], 3], [[200, 200, 200], 4]] },
  { url: "/models/birds/sparrow.glb", length: 0.34, yaw: 0,
    swap: [[[197, 118, 52], 5], [[196, 185, 165], 4], [[98, 64, 36], 6], [[9, 8, 4], 3]] },
] as const;

const functions = /* glsl */ `
  attribute vec4 aFrom; // perch (xyz) and facing it takes off from
  attribute vec4 aTo; // perch and facing it lands on (equal to aFrom while sitting)
  attribute vec4 aFlight; // start time, duration (0 = sitting), arc height, idle phase
  uniform float uTime;

  float angLerp(float a, float b, float k) {
    return a + (mod(b - a + 3.14159265, 6.2831853) - 3.14159265) * k;
  }

  vec3 flightPos(float u) {
    float e = u * u * (3.0 - 2.0 * u);
    vec3 p = mix(aFrom.xyz, aTo.xyz, e);
    p.y += aFlight.z * sin(3.14159265 * u);
    return p;
  }

  // Pitch (nose down positive), roll about the nose, then yaw.
  vec3 pose(vec3 v, float pitch, float roll, float yaw) {
    v = vec3(v.x, v.y * cos(pitch) - v.z * sin(pitch), v.y * sin(pitch) + v.z * cos(pitch));
    v = vec3(v.x * cos(roll) - v.y * sin(roll), v.x * sin(roll) + v.y * cos(roll), v.z);
    return vec3(v.x * cos(yaw) + v.z * sin(yaw), v.y, -v.x * sin(yaw) + v.z * cos(yaw));
  }
`;

const beginNormal = /* glsl */ `
  float bt = uTime;
  float bph = aFlight.w;
  bool bfly = aFlight.y > 0.0;
  float bu = bfly ? clamp((bt - aFlight.x) / aFlight.y, 0.0, 1.0) : 0.0;
  // 1 = perched and upright, 0 = in the air.
  float bfold = bfly ? max(1.0 - smoothstep(0.0, 0.1, bu), smoothstep(0.88, 1.0, bu)) : 1.0;

  float bpeck = smoothstep(0.8, 1.0, sin(bt * 0.55 + bph * 5.0)) * (0.5 + 0.5 * sin(bt * 11.0));
  float bturn = 0.9 * smoothstep(0.8, 0.95, sin(bt * 0.16 + bph * 2.0)) * sign(sin(bph * 17.0));
  float bhop = smoothstep(0.96, 0.99, sin(bt * 0.21 + bph * 3.0));

  vec3 bp = aFrom.xyz;
  float byaw = aFrom.w;
  float bpitch = 0.45 * bpeck;
  float broll = 0.0;
  float blift = 0.04 * bhop * (1.0 - bhop);
  if (bfly) {
    bp = flightPos(bu);
    vec3 d = flightPos(min(bu + 0.03, 1.0)) - flightPos(max(bu - 0.03, 0.0));
    float climb = clamp(-atan(d.y, max(length(d.xz), 0.001)) * 0.8, -0.6, 0.6);
    bpitch = mix(climb, bpitch, bfold);
    float fy = atan(aTo.x - aFrom.x, aTo.z - aFrom.z);
    byaw = angLerp(angLerp(aFrom.w, fy, smoothstep(0.0, 0.12, bu)), aTo.w, smoothstep(0.8, 1.0, bu));
    broll = 0.3 * sin(bu * 6.2831853 + bph) * (1.0 - bfold);
    blift = 0.035 * sin(bt * 22.0 + bph) * (1.0 - bfold);
  }
  byaw += bturn * bfold;
  vec3 objectNormal = pose(normal, bpitch, broll, byaw);
`;

const beginVertex = /* glsl */ `
  vec3 transformed = bp + vec3(0.0, blift, 0.0) + pose(position, bpitch, broll, byaw);
`;

type Spot = { tree: number; at: Vector3 };
type Bird = { group: number; slot: number; spot: number; flying: boolean; next: number; lands: number };

/** Vertices in the top of a tree's canopy, in world space: surface points a bird can sit on. */
function canopyTop(scene: Object3D, matrix: Matrix4) {
  scene.updateMatrixWorld(true);
  const pts: Vector3[] = [];
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const m = new Matrix4().multiplyMatrices(matrix, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
  });
  const top = Math.max(...pts.map((p) => p.y));
  const low = Math.min(...pts.map((p) => p.y));
  return pts.filter((p) => p.y >= top - 0.18 * (top - low));
}

/** The model's own geometry, ignoring node transforms (the jay's file lays it on its back), turned to
 *  face +z, scaled to `length` metres nose to tail and set with its feet at the origin. */
function bodyOf(scene: Object3D, length: number, yaw: number, swap: readonly (readonly [readonly number[], number])[]) {
  let mesh!: Mesh;
  scene.traverse((o) => { if (o instanceof Mesh && !mesh) mesh = o; });
  const geo = mesh.geometry.clone().rotateY(yaw);
  geo.computeBoundingBox();
  const box = geo.boundingBox as Box3;
  const c = box.getCenter(new Vector3());
  const k = length / (box.max.z - box.min.z);
  geo.translate(-c.x, -box.min.y, -c.z).scale(k, k, k);
  geo.setAttribute("aTone", new BufferAttribute(toneIds(geo, (mesh.material as MeshStandardMaterial).map!.image, swap), 1));
  return geo;
}

/** The palette tone of each vertex: the swap entry nearest to the atlas colour under its UV. */
function toneIds(geo: BufferGeometry, image: CanvasImageSource & { width: number; height: number }, swap: readonly (readonly [readonly number[], number])[]) {
  const { width: w, height: h } = image;
  const ctx = new OffscreenCanvas(w, h).getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const uv = geo.getAttribute("uv");
  const ids = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) {
    const [r, g, b] = ctx.getImageData(Math.min(w - 1, Math.floor(uv.getX(i) * w)), Math.min(h - 1, Math.floor(uv.getY(i) * h)), 1, 1).data;
    let best = Infinity;
    for (const [c, id] of swap) {
      const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      if (d < best) { best = d; ids[i] = id; }
    }
  }
  return ids;
}

function birdMaterial() {
  const material = new MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0, transparent: true });
  const uTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uTone = { value: tones };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${functions}\nattribute float aTone;\nflat varying float vTone;`)
      .replace("#include <beginnormal_vertex>", beginNormal)
      .replace("#include <begin_vertex>", `vTone = aTone;\n${beginVertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uTone[${TONES.length}];\nflat varying float vTone;`)
      .replace("#include <color_fragment>", "diffuseColor.rgb *= uTone[int(vTone + 0.5)];");
  };
  material.userData.programKey = "birds";
  material.customProgramCacheKey = () => "birds";
  material.userData.htScale = HALFTONE_SCALE;
  return { material, uTime };
}

function build(scenes: Object3D[], trees: Object3D[]) {
  const rnd = seeded(5);
  const byAngle = TREES.map((t, i) => ({ t, i, a: Math.atan2(t.at[1], t.at[0]) })).sort((x, y) => x.a - y.a);
  const spots: Spot[] = [];
  const first: number[] = []; // first spot of each perch tree
  for (let k = 0; k < PERCH_TREES; k++) {
    const { t } = byAngle[Math.floor((k * TREES.length) / PERCH_TREES)];
    const pts = canopyTop(trees[TREE_TYPES.indexOf(t.type)], trs(t.at[0], 0, t.at[1], t.turn, t.scale));
    const a = pts[Math.floor(rnd() * pts.length)];
    let b = pts[Math.floor(rnd() * pts.length)];
    for (let tries = 0; tries < 40 && Math.hypot(a.x - b.x, a.z - b.z) < 0.5 * t.scale; tries++) b = pts[Math.floor(rnd() * pts.length)];
    first.push(spots.length);
    for (const p of [a, b]) spots.push({ tree: k, at: p.clone().setY(p.y + 0.01) });
  }

  const start = [
    ...Array.from({ length: START_TREES }, (_, k) => first[k * 2]),
    ...PAIRED.map((k) => first[k * 2] + 1),
  ];
  const groups = BODY_MODELS.map((m, g) => {
    const geo = bodyOf(scenes[g], m.length, m.yaw, m.swap);
    const n = start.filter((_, i) => i % BODY_MODELS.length === g).length;
    const geometry = new InstancedBufferGeometry();
    for (const name of ["position", "normal", "aTone"]) geometry.setAttribute(name, geo.getAttribute(name));
    geometry.setIndex(geo.index);
    const from = new Float32Array(n * 4);
    const to = new Float32Array(n * 4);
    const flight = new Float32Array(n * 4);
    geometry.setAttribute("aFrom", new InstancedBufferAttribute(from, 4));
    geometry.setAttribute("aTo", new InstancedBufferAttribute(to, 4));
    geometry.setAttribute("aFlight", new InstancedBufferAttribute(flight, 4));
    geometry.instanceCount = n;
    return { geometry, from, to, flight, ...birdMaterial() };
  });

  const birds: Bird[] = [];
  const filled = BODY_MODELS.map(() => 0);
  start.forEach((s, i) => {
    const group = i % BODY_MODELS.length;
    const slot = filled[group]++;
    const { from, to, flight } = groups[group];
    from.set([spots[s].at.x, spots[s].at.y, spots[s].at.z, rnd() * 6.283], slot * 4);
    to.set(from.subarray(slot * 4, slot * 4 + 4), slot * 4);
    flight[slot * 4 + 3] = rnd() * 6.283;
    birds.push({ group, slot, spot: s, flying: false, next: 2 + rnd() * WAIT.max, lands: 0 });
  });
  return { groups, spots, birds, taken: new Set(start) };
}

/** Two instanced draws, one per bird model. Birds sit on tree canopies; the CPU only decides when one
 *  hops to another tree, and the shader does the idling and the flight arc from a few per-bird attributes. */
export default function Birds() {
  const trees = useGLTF(TREE_URLS).map((g) => g.scene);
  const bodies = useGLTF(BODY_MODELS.map((m) => m.url)).map((g) => g.scene);
  const world = useMemo(() => build(bodies, trees), [...trees, ...bodies]); // eslint-disable-line react-hooks/exhaustive-deps
  const meshes = useMemo(() => world.groups.map((g) => {
    const mesh = new Mesh(g.geometry, g.material);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    return mesh;
  }), [world]);

  useFrame((state) => {
    const { groups, spots, birds, taken } = world;
    const on = night.value <= 0.95;
    for (const m of meshes) m.visible = on;
    if (!on) return;
    const t = state.clock.elapsedTime;
    TONES.forEach((name, i) => mixPair(palette[name], night.value, tones[i]));
    for (const g of groups) {
      g.uTime.value = t;
      g.material.opacity = 1 - night.value;
    }

    let airborne = birds.filter((b) => b.flying).length;
    const dirty = new Set<number>();
    birds.forEach((b) => {
      const { from, to, flight } = groups[b.group];
      const o = b.slot * 4;
      if (b.flying && t >= b.lands) {
        from.set(to.subarray(o, o + 4), o);
        flight[o + 1] = 0;
        b.flying = false;
        b.next = t + WAIT.min + Math.random() * (WAIT.max - WAIT.min);
        airborne--;
        dirty.add(b.group);
      } else if (!b.flying && t >= b.next) {
        const here = spots[b.spot];
        const options = spots
          .map((s, k) => ({ k, d: Math.hypot(s.at.x - here.at.x, s.at.z - here.at.z) }))
          .filter(({ k, d }) => !taken.has(k) && spots[k].tree !== here.tree && d >= HOP.min && d <= HOP.max)
          .sort((p, q) => p.d - q.d)
          .slice(0, 6);
        if (airborne >= MAX_AIRBORNE || !options.length) {
          b.next = t + 1 + Math.random() * 3;
          return;
        }
        const { k, d } = options[Math.floor(Math.random() * options.length)];
        const dur = Math.min(3, Math.max(1.5, d / 4.5));
        taken.delete(b.spot);
        taken.add(k);
        b.spot = k;
        b.flying = true;
        b.lands = t + dur;
        airborne++;
        to.set([spots[k].at.x, spots[k].at.y, spots[k].at.z, Math.random() * 6.283], o);
        flight[o] = t;
        flight[o + 1] = dur;
        flight[o + 2] = 2 + Math.random() * 4;
        dirty.add(b.group);
      }
    });
    for (const g of dirty) for (const name of ["aFrom", "aTo", "aFlight"]) groups[g].geometry.getAttribute(name).needsUpdate = true;
  });

  return (
    <>
      {meshes.map((m, i) => <primitive key={BODY_MODELS[i].url} object={m} />)}
    </>
  );
}
