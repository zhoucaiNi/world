import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedBufferGeometry, MeshBasicMaterial,
  MeshStandardMaterial, RingGeometry,
} from "three";
import { MODULE, TOWN, seeded } from "./town";
import { night, palette, mixPair } from "./theme";

// Everything here is in world units. Measured from fountain-round-detail.glb at MODULE scale:
// the basin water is flat at 0.35 and the pillar's top is at 1.2.
const BASIN_Y = 0.14 * MODULE;
const SPOUT_Y = 0.48 * MODULE;
const [FX, FZ] = TOWN.props.find((p) => p.kind === "fountain")!.at;
export const FOUNTAIN_AT: [number, number] = [FX, FZ];

const GRAVITY = 5; // floaty on purpose: a slow, soft arc
const PERIOD = 1.5; // seconds for one pass of the whole droplet cycle (longer than any flight)
const DROPS = 140;
const RINGS = 36; // each ring sits where one of the first droplets lands

const time = { value: 0 };

const FLIGHT = /* glsl */ `
  const float G = ${GRAVITY.toFixed(1)};
  const float PERIOD = ${PERIOD.toFixed(2)};
  const float SPOUT_Y = ${SPOUT_Y.toFixed(3)};
  const float BASIN_Y = ${BASIN_Y.toFixed(3)};
  // aSeed: phase, heading, launch speed up, landing distance from the centre.
  float flightTime(float up) { return (up + sqrt(up * up + 2.0 * G * (SPOUT_Y - BASIN_Y))) / G; }
`;

/** The water surface: the basin material plus slow ripples spreading from the spout and a drifting
 *  glitter. Both are computed from world position, so they stay on the water as you move. */
export function waterMaterial() {
  const mat = new MeshStandardMaterial({ roughness: 0.35 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uNight = night;
    shader.uniforms.uCentre = { value: FOUNTAIN_AT };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nuniform float uNight;\nuniform vec2 uCentre;\nvarying vec3 vWaterPos;",
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          vec2 p = vWaterPos.xz - uCentre;
          float r = length(p);
          float wave = sin(r * 8.0 - uTime * 1.4 + 0.6 * sin(atan(p.y, p.x) * 3.0 + uTime * 0.3));
          float ripple = smoothstep(0.45, 1.0, wave) * smoothstep(0.5, 1.0, r) * (1.0 - 0.5 * smoothstep(1.0, 1.8, r));
          float glint = sin(p.x * 7.0 + uTime * 0.8) * sin(p.y * 8.0 - uTime * 0.6)
                      + sin((p.x + p.y) * 11.0 + uTime * 1.3) * sin((p.x - p.y) * 9.0 - uTime * 0.9);
          float sparkle = smoothstep(1.2, 1.7, glint) * (1.0 - 0.4 * uNight);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(ripple * 0.3 + sparkle * 0.55, 0.0, 1.0));
        }`,
      );
  };
  mat.customProgramCacheKey = () => "fountain-water";
  mat.userData.noHalftone = true;
  return mat;
}

function seeds() {
  const rnd = seeded(5);
  const a = new Float32Array(DROPS * 4);
  for (let i = 0; i < DROPS; i++) {
    a.set([rnd(), rnd() * Math.PI * 2, 2.3 + rnd() * 0.7, 1.15 + rnd() * 0.5], i * 4);
  }
  return a;
}

function instanced(base: BufferGeometry, seed: Float32Array, count: number) {
  const g = new InstancedBufferGeometry().copy(base as unknown as InstancedBufferGeometry);
  g.setAttribute("aSeed", new InstancedBufferAttribute(seed.slice(0, count * 4), 4));
  g.instanceCount = count;
  return g;
}

/** Droplets rise from the pillar and fall back into the basin in an umbrella; where the first few
 *  land, thin rings spread and fade. The motion is all in the vertex shader (two draw calls). */
export function FountainJet() {
  const seed = useMemo(seeds, []);
  const drops = useMemo(() => instanced(new IcosahedronGeometry(0.04, 1).scale(1, 1.4, 1), seed, DROPS), [seed]);
  const rings = useMemo(() => instanced(new RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2), seed, RINGS), [seed]);

  const [dropMat, ringMat] = useMemo(() => {
    const make = (vertex: string, fade: boolean) => {
      const m = new MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.8 });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\nuniform float uTime;\nattribute vec4 aSeed;\nvarying float vFade;\n${FLIGHT}`)
          .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertex}`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vFade;")
          .replace("#include <color_fragment>", `#include <color_fragment>\n${fade ? "diffuseColor.a *= vFade;" : ""}`);
      };
      m.customProgramCacheKey = () => (fade ? "fountain-rings" : "fountain-drops");
      return m;
    };
    const common = /* glsl */ `
      float up = aSeed.z;
      float landing = flightTime(up);
      float t = fract(uTime / PERIOD + aSeed.x) * PERIOD;
      vec2 dir = vec2(cos(aSeed.y), sin(aSeed.y));`;
    const drop = make(/* glsl */ `${common}
      float along = aSeed.w / landing * t;
      float alive = step(t, landing) * smoothstep(0.0, 0.1, t);
      vFade = 1.0;
      transformed = transformed * alive + vec3(dir.x * (along + 0.06), SPOUT_Y + up * t - 0.5 * G * t * t, dir.y * (along + 0.06));`, false);
    const ring = make(/* glsl */ `${common}
      float age = t - landing;
      float life = 0.9;
      float alive = step(0.0, age) * step(age, life);
      vFade = (1.0 - age / life) * 0.7;
      transformed = transformed * (0.05 + 0.35 * age) * alive + vec3(dir * aSeed.w, BASIN_Y + 0.02).xzy;`, true);
    return [drop, ring];
  }, []);

  const base = useRef(new Color());
  useEffect(() => () => { drops.dispose(); rings.dispose(); dropMat.dispose(); ringMat.dispose(); }, [drops, rings, dropMat, ringMat]);

  useFrame((state) => {
    time.value = state.clock.elapsedTime;
    // Lighter than the basin, so the spray reads against it; dimmer at night so it doesn't glow.
    mixPair(palette.water, night.value, base.current).lerp(new Color("#ffffff"), 0.45 - 0.15 * night.value);
    base.current.multiplyScalar(1 - 0.6 * night.value);
    dropMat.color.copy(base.current);
    ringMat.color.copy(base.current);
  });

  return (
    <group position={[FX, 0, FZ]} userData={{ noHalftone: true }}>
      <mesh geometry={drops} material={dropMat} frustumCulled={false} renderOrder={2} userData={{ noHalftone: true }} />
      <mesh geometry={rings} material={ringMat} frustumCulled={false} renderOrder={1} userData={{ noHalftone: true }} />
    </group>
  );
}
