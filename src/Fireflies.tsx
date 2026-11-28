import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, type Points } from "three";
import { night } from "./theme";
import { WORLD } from "./worldConfig";
import { ISLAND_RADIUS, TOWN, TREES, blocked, onPath, seeded } from "./town";

const F = WORLD.atmosphere.fireflies;
const COUNT = F.count;

const vertex = /* glsl */ `
  attribute vec4 aSeed; // x, y: wander phases, z: blink rate, w: blink phase
  uniform float uTime;
  uniform float uPx;
  uniform float uWander;
  uniform float uSize;
  varying float vGlow;
  varying float vTint;
  void main() {
    float t = uTime;
    vec3 p = position;
    // Lissajous figure-eight, a few metres wide, with a slow bob.
    p.x += sin(t * 0.21 + aSeed.x) * 1.6 * uWander;
    p.z += sin(t * 0.42 + aSeed.x) * 1.0 + cos(t * 0.17 + aSeed.y) * 0.6 * uWander;
    p.y += sin(t * 0.33 + aSeed.y) * 0.35;
    // Mostly lit, with a brief dim between pulses.
    float b = sin(t * aSeed.z + aSeed.w) * 0.5 + 0.5;
    vGlow = smoothstep(0.12, 0.5, b);
    vTint = fract(aSeed.w * 0.37);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Perspective size, clamped so it reads far away and stays small up close.
    gl_PointSize = clamp(260.0 / -mv.z, 22.0, 48.0) * uSize * uPx;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uNight;
  uniform vec3 uColA;
  uniform vec3 uColB;
  varying float vGlow;
  varying float vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float halo = 1.0 - smoothstep(0.0, 1.0, d);
    float a = max(pow(halo, 2.2) * 0.85, 1.0 - smoothstep(0.0, 0.22, d)) * vGlow * uNight;
    if (a < 0.01) discard;
    vec3 col = mix(uColA, uColB, vTint);
    gl_FragColor = vec4(col * a, a);
  }
`;

function scatter() {
  const rnd = seeded(31);
  const out: number[] = [];
  const [cx, cz] = TOWN.campfire;
  for (let tries = 0; out.length < COUNT * 3 && tries < 6000; tries++) {
    const pick = rnd();
    let x: number;
    let z: number;
    if (pick < F.share[0]) {
      const t = TREES[Math.floor(rnd() * TREES.length)];
      const a = rnd() * Math.PI * 2;
      const r = 1 + rnd() * 3.5;
      x = t.at[0] + Math.cos(a) * r;
      z = t.at[1] + Math.sin(a) * r;
    } else if (pick < F.share[1]) {
      const a = rnd() * Math.PI * 2;
      const r = 2 + rnd() * 5;
      x = cx + Math.cos(a) * r;
      z = cz + Math.sin(a) * r;
    } else if (pick < F.share[2]) {
      // Around the fountain basin (its collider covers the middle).
      const a = rnd() * Math.PI * 2;
      const r = 3 + rnd() * 4;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } else {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * (ISLAND_RADIUS - 2);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (Math.hypot(x, z) > ISLAND_RADIUS - 1.5 || blocked(x, z, 0.8)) continue;
    if (onPath(x, z, 0.5) && rnd() > 0.15) continue;
    out.push(x, 0.3 + rnd() * 1.9, z);
  }
  return out;
}

/** One additive Points draw. Drift and blink run in the vertex shader off a time uniform. */
export default function Fireflies() {
  const ref = useRef<Points>(null);
  const { geometry, material } = useMemo(() => {
    const pos = scatter();
    const n = pos.length / 3;
    const rnd = seeded(97);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seed[i * 4] = rnd() * 6.283;
      seed[i * 4 + 1] = rnd() * 6.283;
      seed[i * 4 + 2] = 0.6 + rnd() * 1.1;
      seed[i * 4 + 3] = rnd() * 6.283;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seed, 4));
    const material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uPx: { value: 1 }, uWander: { value: F.wander }, uSize: { value: F.size },
        uColA: { value: new Color(...F.colors[0]) }, uColB: { value: new Color(...F.colors[1]) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry, material };
  }, []);

  useFrame((state) => {
    const pts = ref.current;
    if (!pts) return;
    const on = night.value >= 0.05;
    pts.visible = on;
    if (!on) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uNight.value = night.value;
    material.uniforms.uPx.value = state.gl.getPixelRatio();
  });

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} castShadow={false} userData={{ noHalftone: true }} />;
}
