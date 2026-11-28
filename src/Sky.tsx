import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BackSide, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mixPair, night, palette } from "./theme";
import { WORLD } from "./worldConfig";
import { seeded } from "./town";

const A = WORLD.atmosphere;
const tint = A.fog.tint ? new Color(A.fog.tint) : null;

/** The fog colour: the horizon sky, pulled toward a warm tint by day (humid haze). The sky dome uses it too, so far ground melts into it. */
export function fogColourAt(t: number, out: Color) {
  mixPair(palette.sky, t, out);
  if (tint) out.lerp(tint, A.fog.tintAmount * (1 - t));
  return out;
}

const SUN_DIR = new Vector3(...A.sunPos[0]).normalize();

// A gradient sky dome: the horizon matches the fog colour so the far ground melts into it,
// and it deepens to sky blue overhead by day (navy at night). The jurassic variant adds a warm
// glow round the sun, a few soft cloud bands and hazy mountain/volcano silhouettes (all in this one shader).
export default function Sky() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uHorizon: { value: new Color() }, uTop: { value: new Color() }, uHaze: { value: new Color() },
          uMtn: { value: new Color() }, uSunDir: { value: SUN_DIR }, uHazeAmt: { value: 0 }, uMtnAmt: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uTop;
          uniform vec3 uHaze;
          uniform vec3 uMtn;
          uniform vec3 uSunDir;
          uniform float uHazeAmt;
          uniform float uMtnAmt;
          varying vec3 vDir;
          float peak(float az, float at, float width, float h) {
            float d = abs(atan(sin(az - at), cos(az - at)));
            return h * pow(max(0.0, 1.0 - d / width), 1.3);
          }
          void main() {
            vec3 dir = normalize(vDir);
            float h = smoothstep(0.0, 0.55, dir.y);
            vec3 col = mix(uHorizon, uTop, pow(h, 0.7));
            if (uHazeAmt > 0.0) {
              // Warm glow round the sun, strongest low down.
              float g = pow(max(dot(dir, uSunDir), 0.0), 5.0);
              col = mix(col, uHaze, g * 0.55 * uHazeAmt * (1.0 - h * 0.5));
              // Soft cloud bands, two slow sine layers (cheap, no texture).
              float az = atan(dir.x, dir.z);
              float c = sin(az * 5.0 + dir.y * 9.0) * sin(az * 3.0 - dir.y * 14.0 + 1.3);
              float band = smoothstep(0.1, 0.5, dir.y) * (1.0 - smoothstep(0.5, 0.8, dir.y));
              col = mix(col, uHaze, smoothstep(0.15, 0.75, c) * band * 0.35 * uHazeAmt);
            }
            if (uMtnAmt > 0.0) {
              float az = atan(dir.x, dir.z);
              float ridge = 0.04 + 0.025 * sin(az * 3.0 + 1.0) + 0.015 * sin(az * 8.0);
              float vol = min(peak(az, 2.3, 0.4, 0.3), 0.19); // flat-topped volcano
              float far = max(peak(az, -0.9, 0.55, 0.15), peak(az, 0.5, 0.5, 0.1));
              float top = max(ridge, max(vol, far));
              col = mix(col, uMtn, (1.0 - smoothstep(top - 0.006, top + 0.006, dir.y)) * step(0.0, dir.y) * uMtnAmt);
              // A faint plume of smoke drifting off the crater.
              float p = length(vec2((az - 2.45) * 2.2, (dir.y - 0.3) * 4.0));
              col = mix(col, uMtn, (1.0 - smoothstep(0.0, 0.5, p)) * 0.25 * uMtnAmt);
            }
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );

  useFrame(() => {
    const u = mat.uniforms;
    fogColourAt(night.value, u.uHorizon.value);
    mixPair(palette.skyTop, night.value, u.uTop.value);
    if (A.sky.haze) {
      u.uHaze.value.set(A.sky.haze);
      u.uHazeAmt.value = 1 - night.value;
    }
    if (A.sky.mountains) {
      u.uMtn.value.copy(u.uHorizon.value).lerp(mixPair(palette.leaf, night.value), 0.55);
      u.uMtnAmt.value = 0.8;
    }
  });

  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}

const COMMON_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const MIST_COUNT = 8;
const MIST_SIZE = 20;

/** Low ground mist: a few huge soft quads just above the ground, drifting slowly and fading near the camera and far away. */
export function Mist() {
  const refs = useRef<(Mesh | null)[]>([]);
  const { geometry, material, base } = useMemo(() => {
    const rnd = seeded(5);
    const base = Array.from({ length: MIST_COUNT }, (_, i) => {
      const a = (i / MIST_COUNT) * Math.PI * 2 + rnd();
      const r = 3 + rnd() * 20;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.35 + rnd() * 0.9, ph: rnd() * 6.28 };
    });
    const geometry = new PlaneGeometry(MIST_SIZE, MIST_SIZE).rotateX(-Math.PI / 2);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0 }, uTime: { value: 0 }, uFar: { value: A.fog.far } },
      vertexShader: COMMON_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uFar;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vDist;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = 1.0 - smoothstep(0.1, 1.0, r);
          float n = 0.6 + 0.4 * sin(vWorld.x * 0.32 + uTime * 0.12) * sin(vWorld.z * 0.27 - uTime * 0.09);
          a *= n * uOpacity * smoothstep(1.5, 6.0, vDist) * (1.0 - smoothstep(uFar * 0.6, uFar, vDist));
          gl_FragColor = vec4(uColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geometry, material, base };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const u = material.uniforms;
    u.uTime.value = t;
    fogColourAt(night.value, u.uColor.value).multiplyScalar(1.08);
    u.uOpacity.value = A.mist * (1 - night.value * 0.45);
    refs.current.forEach((m, i) => {
      if (m) m.position.set(base[i].x + Math.sin(t * 0.05 + base[i].ph) * 3, base[i].y, base[i].z + Math.cos(t * 0.04 + base[i].ph) * 3);
    });
  });

  return (
    <>
      {base.map((_, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }} geometry={geometry} material={material} renderOrder={2} frustumCulled={false} userData={{ noHalftone: true }} />
      ))}
    </>
  );
}

const SHAFTS = 4;
const SHAFT_LEN = 38;

/** A few broad, very faint light shafts slanting along the sun direction (day only), each two crossed soft-edged planes. */
export function LightShafts() {
  const group = useRef<Group>(null);
  const { geometry, material, spots } = useMemo(() => {
    const rnd = seeded(23);
    const make = (w: number, yaw: number) => new PlaneGeometry(w, SHAFT_LEN).translate(0, -SHAFT_LEN / 2, 0).rotateY(yaw);
    const spots = Array.from({ length: SHAFTS }, (_, i) => {
      const a = (i / SHAFTS) * Math.PI * 2 + rnd();
      const r = 6 + rnd() * 14;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, w: 6 + rnd() * 4 };
    });
    const geometry = mergeGeometries([make(8, 0), make(8, Math.PI / 2)]);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: COMMON_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vDist;
        void main() {
          float s = sin(vUv.x * 3.14159);
          float edge = s * s * s;                          // soft falloff to both sides
          float along = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65 * vUv.y); // dissolves into the sky above, brightest near the ground
          float shimmer = 0.75 + 0.25 * sin(uTime * 0.35 + vWorld.x * 0.4 + vWorld.z * 0.3);
          float a = edge * along * shimmer * uOpacity * smoothstep(3.0, 10.0, vDist);
          gl_FragColor = vec4(uColor * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geometry, material, spots };
  }, []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const on = night.value < 0.97;
    g.visible = on;
    if (!on) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uOpacity.value = A.shafts * (1 - night.value);
    mixPair(palette.sun, 0, material.uniforms.uColor.value);
  });

  // Each shaft hangs from a point up the sun direction and runs down to the ground at (x, z).
  return (
    <group ref={group}>
      {spots.map((s, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={[s.x + SUN_DIR.x * SHAFT_LEN, SUN_DIR.y * SHAFT_LEN, s.z + SUN_DIR.z * SHAFT_LEN]}
          quaternion={SHAFT_Q}
          scale={[s.w / 8, 1, 1]}
          frustumCulled={false}
          renderOrder={3}
          userData={{ noHalftone: true }}
        />
      ))}
    </group>
  );
}
const SHAFT_Q = new Group().quaternion.setFromUnitVectors(new Vector3(0, -1, 0), SUN_DIR.clone().negate());
