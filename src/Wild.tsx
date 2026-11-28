// The Jurassic park's wild ground and its watering hole (used only when WORLD.id === "jurassic").
// WildGround: one transparent decal over the lawn, painted on a canvas: packed earth where the plaza and lane were,
// faint game trails, a muddy bank round the pond (darker where wet) and footprints. Pond: an irregular, shallow,
// see-through water surface with soft shorelines and drifting ripples; no jets.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, MeshStandardMaterial, SRGBColorSpace } from "three";
import { ISLAND_RADIUS, POND, TOWN, pondRadius, seeded } from "./town";
import { mixPair, night, palette } from "./theme";

const EARTH: readonly [string, string] = ["#a58558", "#2e261a"];
const SPAN = (ISLAND_RADIUS + 2) * 2;
const RES = 2048;
const px = (v: number) => ((v + SPAN / 2) / SPAN) * RES;
const PER_M = RES / SPAN;

/** The ground decal. RGB is a brightness map (dry earth bright, wet mud dark) multiplied by the earth colour. */
function paintGround() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = RES;
  const ctx = canvas.getContext("2d")!;
  const rnd = seeded(12);
  const blob = (x: number, z: number, r: number, tone: number, alpha: number) => {
    const g = ctx.createRadialGradient(px(x), px(z), 0, px(x), px(z), r * PER_M);
    const c = `rgb(${tone},${tone},${tone})`;
    g.addColorStop(0, c.replace("rgb", "rgba").replace(")", `,${alpha})`));
    g.addColorStop(0.55, c.replace("rgb", "rgba").replace(")", `,${alpha * 0.55})`));
    g.addColorStop(1, c.replace("rgb", "rgba").replace(")", ",0)"));
    ctx.fillStyle = g;
    ctx.fillRect(px(x) - r * PER_M, px(z) - r * PER_M, r * 2 * PER_M, r * 2 * PER_M);
  };
  const tone = () => 200 + Math.floor(rnd() * 55); // dry earth: mottled

  // Worn earth where the plaza and the lane to the spawn were: overlapping soft patches, thinning toward the edge.
  for (const { from, to } of TOWN.paths) {
    const w = to[0] - from[0];
    const d = to[1] - from[1];
    const plaza = w > 10;
    const n = Math.round((w * d) / (plaza ? 2.6 : 3));
    for (let i = 0; i < n; i++) {
      const u = rnd();
      const v = rnd();
      // Pull points toward the middle so the edge is sparse and ragged, never a straight line.
      const x = from[0] + w * (0.5 + (u - 0.5) * (plaza ? 1.0 : 0.8)) + (rnd() - 0.5) * 1.6;
      const z = from[1] + d * (0.5 + (v - 0.5) * 1.0) + (rnd() - 0.5) * 1.6;
      const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      if (rnd() < edge * edge * 0.5) continue;
      blob(x, z, 1.6 + rnd() * 2.2, tone(), 0.5 * (1 - 0.35 * edge));
    }
  }
  // The lane's end is a meandering trail rather than a strip.
  for (let z = 19.5; z > 8; z -= 0.45) blob(0.45 * Math.sin(z * 0.45) + (rnd() - 0.5) * 0.5, z, 1.2 + rnd() * 0.5, tone(), 0.45);

  // Faint game trails: dinosaurs walking from the watering hole out to the campfire and across the park.
  const trail = (pts: [number, number][], width: number, alpha: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let s = 0; s < len; s += 0.4) {
        const t = s / len;
        const wob = Math.sin((i * 3 + t) * 2.1) * 0.5 + (rnd() - 0.5) * 0.3;
        blob(ax + (bx - ax) * t + nx * wob, az + (bz - az) * t + nz * wob, width * (0.8 + rnd() * 0.5), tone(), alpha);
      }
    }
  };
  trail([[4.5, 4], [8, 8], [11, 10.5], [TOWN.campfire[0] - 1.5, TOWN.campfire[1] - 1.5]], 0.75, 0.3);
  trail([[-4.5, -2], [-9, -5], [-13, -4.5], [-17, -2], [-21, 1.5]], 0.7, 0.26);
  trail([[2, -5], [4, -10], [3, -15], [5, -21]], 0.65, 0.24);
  trail([[-3, 5], [-8, 9], [-11, 13], [-12.5, 18]], 0.65, 0.22);
  trail([[5, 0], [12, -1], [17.5, -3.5], [22, -3]], 0.6, 0.2);

  // The pond's bank: a wide dry-mud ring, then wet dark mud hugging the water (and under its see-through edge).
  const ring = (inner: number, outer: number, step: number, size: number, toneLo: number, toneHi: number, alpha: number) => {
    for (let a = 0; a < Math.PI * 2; a += step) {
      const base = pondRadius(a);
      const r = base + inner + rnd() * (outer - inner);
      const k = (r - base - inner) / Math.max(0.01, outer - inner);
      blob(POND.at[0] + Math.cos(a) * r, POND.at[1] + Math.sin(a) * r, size * (0.8 + rnd() * 0.6), Math.floor(toneLo + (toneHi - toneLo) * k), alpha);
    }
  };
  ring(-0.3, 2.3, 0.025, 1.0, 170, 215, 0.5);
  ring(-0.6, 1.0, 0.03, 0.7, 105, 150, 0.7);
  for (let a = 0; a < Math.PI * 2; a += 0.09) { // under the shallows
    const r = pondRadius(a) * (0.55 + rnd() * 0.4);
    blob(POND.at[0] + Math.cos(a) * r, POND.at[1] + Math.sin(a) * r, 0.9, 95, 0.7);
  }
  // Footprints: three-toed prints in the bank's mud, in a few trails and some strays.
  const print = (x: number, z: number, yaw: number, size: number) => {
    ctx.save();
    ctx.translate(px(x), px(z));
    ctx.rotate(-yaw);
    ctx.fillStyle = "rgba(38,30,22,0.62)";
    const s = size * PER_M;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.3, s * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const a of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(Math.sin(a) * s * 0.62, -Math.cos(a) * s * 0.62, s * 0.11, s * 0.3, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  for (const [a0, dir, n] of [[0.9, 1, 8], [3.6, -1, 7], [5.4, 1, 6]] as const) {
    for (let i = 0; i < n; i++) {
      const a = a0 + dir * i * 0.1;
      const r = pondRadius(a) + 0.5 + 0.4 * Math.sin(i * 0.9);
      const [tx, tz] = [-Math.sin(a) * dir, Math.cos(a) * dir]; // walking along the bank
      const yaw = -Math.atan2(tx, -tz) + (i % 2 ? 0.25 : -0.25);
      print(POND.at[0] + Math.cos(a) * r, POND.at[1] + Math.sin(a) * r, yaw, 0.5);
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2;
    const r = pondRadius(a) + 0.2 + rnd() * 1.2;
    print(POND.at[0] + Math.cos(a) * r, POND.at[1] + Math.sin(a) * r, rnd() * Math.PI * 2, 0.4 + rnd() * 0.2);
  }
  return canvas;
}

export function WildGround() {
  const [map, mat] = useMemo(() => {
    const tex = new CanvasTexture(paintGround());
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.noHalftone = true;
    return [tex, m] as const;
  }, []);
  useEffect(() => () => { map.dispose(); mat.dispose(); }, [map, mat]);
  useFrame(() => { mixPair(EARTH, night.value, mat.color); });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow material={mat} userData={{ noHalftone: true }} renderOrder={1}>
      <planeGeometry args={[SPAN, SPAN]} />
    </mesh>
  );
}

const WATER_Y = 0.06;
const RINGS = 12;
const SEGS = 96;

/** A warped disc: radius follows `pondRadius`, a little wider so the transparent edge laps onto the bank. aF: 0 centre .. 1 rim. */
function pondGeometry() {
  const pos: number[] = [];
  const f: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const k = i / RINGS;
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      const r = k * pondRadius(a) * 1.12;
      pos.push(POND.at[0] + Math.cos(a) * r, WATER_Y, POND.at[1] + Math.sin(a) * r);
      f.push(k / 1.0);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = i * SEGS + j;
      const b = i * SEGS + ((j + 1) % SEGS);
      const c = (i + 1) * SEGS + j;
      const d = (i + 1) * SEGS + ((j + 1) % SEGS);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("aF", new Float32BufferAttribute(f, 1));
  g.setIndex(idx);
  g.computeVertexNormals(); // flat disc: every normal points up
  return g;
}

const time = { value: 0 };

function waterSurface() {
  const m = new MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.22, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aF;\nvarying float vF;\nvarying vec2 vWp;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vF = aF;
        vWp = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uNight;\nvarying float vF;\nvarying vec2 vWp;")
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
        {
          vec2 p = vWp;
          // Two slow, crossing swells and a finer shimmer: cheap, no normals needed.
          float w1 = sin(p.x * 2.3 + uTime * 0.55 + 1.4 * sin(p.y * 1.7 - uTime * 0.3));
          float w2 = sin(p.y * 2.9 - uTime * 0.7 + 1.2 * sin(p.x * 2.1 + uTime * 0.35));
          float w3 = sin((p.x + p.y) * 6.5 + uTime * 1.3) * sin((p.x - p.y) * 5.7 - uTime * 1.0);
          float ripple = smoothstep(0.55, 1.0, w1 * w2 * 0.5 + 0.5 * w3 * 0.6 + 0.35);
          vec2 cell = floor(p * 11.0);
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float sparkle = step(0.965, h) * (0.5 + 0.5 * sin(uTime * 2.2 + h * 80.0)) * (1.0 - 0.7 * uNight);
          float shallow = smoothstep(0.15, 0.95, vF);
          vec3 deep = diffuseColor.rgb * vec3(0.5, 0.62, 0.6);
          vec3 lit = diffuseColor.rgb * 1.12 + vec3(0.06, 0.05, 0.0);
          diffuseColor.rgb = mix(deep, lit, shallow);
          diffuseColor.rgb += ripple * 0.07 * (1.0 - 0.5 * uNight) + sparkle * 0.2;
          // See-through: clearer toward the rim, fading to nothing right at the shoreline.
          diffuseColor.a = (0.9 - 0.3 * shallow) * (1.0 - smoothstep(0.62, 1.0, vF));
        }`);
  };
  m.customProgramCacheKey = () => "pond-water";
  m.userData.noHalftone = true;
  return m;
}

export function Pond() {
  const geo = useMemo(pondGeometry, []);
  const mat = useMemo(waterSurface, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const c = useMemo(() => new Color(), []);
  useFrame((state) => {
    time.value = state.clock.elapsedTime;
    mixPair(palette.water, night.value, c);
    mat.color.copy(c);
    // No lanterns here, so at night the water holds a faint moon sheen of its own.
    mat.emissive.copy(c);
    mat.emissiveIntensity = 0.5 * night.value;
  });
  return <mesh geometry={geo} material={mat} renderOrder={2} userData={{ noHalftone: true }} />;
}
