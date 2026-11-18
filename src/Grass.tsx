import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, ShaderChunk, Vector3,
} from "three";
import { seeded } from "./town";

const BLADES = 9;
// Height fractions of the blade's rows and the blade's width there; the tip is a single point.
const ROWS: [f: number, w: number][] = [[0, 1], [0.4, 0.8], [0.75, 0.5]];

/** One clump of tapered, curved blades. `normal` leans toward up so blades light like the
 *  lawn under them instead of like vertical cards; `color` runs dark base to light tip. */
function clumpGeometry(): BufferGeometry {
  const rnd = seeded(7);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.1;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const yaw = a + (rnd() - 0.5) * 1.2;
    const lx = Math.cos(yaw);
    const lz = Math.sin(yaw);
    const h = 0.28 + rnd() * 0.18;
    const w = 0.04 + rnd() * 0.015;
    const lean = 0.25 + rnd() * 0.35;
    const tint = 0.94 + rnd() * 0.12;
    const n = new Vector3(lx, 0, lz).lerp(new Vector3(0, 1, 0), 0.65).normalize();
    const first = pos.length / 3;
    const vertex = (f: number, side: number) => {
      const bend = lean * f * f * h;
      pos.push(bx + lx * bend - lz * side, h * f * (1 - 0.2 * lean * f), bz + lz * bend + lx * side);
      nrm.push(n.x, n.y, n.z);
      const shade = (0.72 + 0.24 * f) * tint;
      col.push(shade * 0.95, shade, shade * (0.92 - 0.08 * f));
    };
    for (const [f, k] of ROWS) {
      vertex(f, -w * k / 2);
      vertex(f, w * k / 2);
    }
    vertex(1, 0);
    for (let row = 0; row < ROWS.length - 1; row++) {
      const v = first + row * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const last = first + (ROWS.length - 1) * 2;
    idx.push(last, last + 2, last + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export const wind = { value: 0 };

const FRONT_FACING = "gl_FrontFacing ? 1.0 : - 1.0";

type Shader = Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];

/** Lit, fogged, shadow-receiving blades that sway in a world-space breeze. Its `color` is the lawn tint.
 *  `sway` scales the breeze; `tweak` and `variant` let other plants extend the shader (variant keys the program cache). */
export function grassMaterial(sway = 0.3, tweak?: (shader: Shader) => void, variant = ""): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide });
  if (!ShaderChunk.normal_fragment_begin.includes(FRONT_FACING)) {
    throw new Error("Grass: three's normal_fragment_begin changed; blade back faces would light dark");
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        {
          vec2 at = instanceMatrix[3].xz;
          float gust = sin(uWind * 1.7 + at.x * 0.35 + at.y * 0.22) * 0.7 + sin(uWind * 2.9 + at.x * 0.9) * 0.3;
          mat3 im = mat3(instanceMatrix);
          // World wind direction carried into the clump's turned, scaled frame.
          vec3 dir = transpose(im) * vec3(1.0, 0.0, 0.4) / dot(im[0], im[0]);
          transformed.xz += dir.xz * gust * ${sway.toFixed(3)} * position.y * position.y;
        }`,
      );
    // Both faces keep the up-leaning normal; the default flip would light every back face dark.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      ShaderChunk.normal_fragment_begin.replace(FRONT_FACING, "1.0"),
    );
    tweak?.(shader);
  };
  mat.customProgramCacheKey = () => `grass-blades-${sway}${variant}`;
  return mat;
}

type Spot = [x: number, z: number, rotation: number, scale: number];

export function Grass({ spots, material }: { spots: Spot[]; material: MeshStandardMaterial }) {
  const geometry = useMemo(clumpGeometry, []);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const up = new Vector3(0, 1, 0);
    const c = new Color();
    spots.forEach(([x, z, rot, sc], k) => {
      im.setMatrixAt(k, m.compose(new Vector3(x, 0, z), q.setFromAxisAngle(up, rot), s.setScalar(sc)));
      // Patchy lawn: neighbouring clumps drift a little lighter or darker.
      const v = 0.92 + 0.12 * (0.5 + 0.5 * Math.sin(x * 0.7 + Math.cos(z * 0.5) * 2));
      im.setColorAt(k, c.setScalar(v));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }, [spots]);
  useFrame((state) => { wind.value = state.clock.elapsedTime; });
  return (
    <instancedMesh ref={ref} args={[geometry, material, spots.length]} receiveShadow userData={{ noHalftone: true }} />
  );
}
