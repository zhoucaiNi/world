import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3,
} from "three";
import { seeded } from "./town";
import { grassMaterial, wind } from "./Grass";

export type Spot = [x: number, z: number, rotation: number, scale: number];
type Rgb = [number, number, number];

/** Vertex soup shared by every plant part; `stem` is 1 where a flower's stem colour replaces the bloom colour. */
export class Parts {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  stem: number[] = [];
  idx: number[] = [];

  vertex(p: Vector3, n: Vector3, c: Rgb, stem = 0) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(...c);
    this.stem.push(stem);
    return this.pos.length / 3 - 1;
  }

  /** A curved lens-shaped blade rising from `at`, tilted `lift` above horizontal and drooping by `curl` over its length. */
  blade(o: {
    at: Vector3; yaw: number; lift: number; curl: number; length: number; width: number;
    profile: [t: number, w: number][]; upBlend: number; color: (t: number) => Rgb; stem?: number;
  }) {
    const out = new Vector3(Math.cos(o.yaw), 0, Math.sin(o.yaw));
    const side = new Vector3(-out.z, 0, out.x);
    const n = out.clone().lerp(new Vector3(0, 1, 0), o.upBlend).normalize();
    const steps = 12;
    const centre = (t: number) => {
      // Integrate the centreline so the blade bends smoothly instead of kinking.
      const p = o.at.clone();
      for (let i = 0; i < steps; i++) {
        const k = Math.min(1, Math.max(0, steps * t - i)) * o.length / steps;
        const a = o.lift - o.curl * (i / steps);
        p.addScaledVector(out, Math.cos(a) * k).y += Math.sin(a) * k;
      }
      return p;
    };
    const rows = o.profile.map(([t, w]) => {
      const p = centre(t);
      const half = side.clone().multiplyScalar(o.width * w / 2);
      return [this.vertex(p.clone().sub(half), n, o.color(t), o.stem), this.vertex(p.add(half), n, o.color(t), o.stem)];
    });
    for (let r = 0; r < rows.length - 1; r++) {
      const [a, b] = rows[r];
      const [c, d] = rows[r + 1];
      this.idx.push(a, c, b, b, c, d);
    }
    const [a, b] = rows[rows.length - 1];
    this.idx.push(a, this.vertex(centre(1), n, o.color(1), o.stem), b);
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.col, 3));
    g.setAttribute("aStem", new Float32BufferAttribute(this.stem, 1));
    g.setIndex(this.idx);
    return g;
  }
}

const UP = new Vector3(0, 1, 0);

function bushGeometry(): BufferGeometry {
  const rnd = seeded(23);
  const parts = new Parts();
  // Outer leaves lie low and wide, inner ones stand up, so the whole reads as one soft mound.
  const rings = [
    { n: 10, radius: 0.06, lift: 0.7, curl: 0.55, length: 0.2, width: 0.1, dark: 0.62 },
    { n: 8, radius: 0.035, lift: 1.05, curl: 0.55, length: 0.22, width: 0.1, dark: 0.7 },
    { n: 5, radius: 0.012, lift: 1.3, curl: 0.4, length: 0.2, width: 0.09, dark: 0.78 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const yaw = ((i + rnd() * 0.6) / ring.n) * Math.PI * 2;
      const tint = 0.92 + rnd() * 0.16;
      parts.blade({
        at: new Vector3(Math.cos(yaw) * ring.radius, -0.01, Math.sin(yaw) * ring.radius),
        yaw: yaw + (rnd() - 0.5) * 0.4,
        lift: ring.lift + (rnd() - 0.5) * 0.2,
        curl: ring.curl,
        length: ring.length * (0.9 + rnd() * 0.2),
        width: ring.width,
        profile: [[0, 0.35], [0.25, 0.9], [0.5, 1], [0.75, 0.8], [0.92, 0.45]],
        upBlend: 0.5,
        color: (t) => {
          const s = (ring.dark + (1 - ring.dark) * t) * tint;
          return [s * 0.95, s, s * (0.92 - 0.06 * t)];
        },
      });
    }
  }
  return parts.geometry();
}

const STEM_HEIGHT = 0.2;
const PETALS = 5;

function flowerGeometry(): BufferGeometry {
  const rnd = seeded(31);
  const parts = new Parts();
  const lean = 0.05;
  const headX = lean;
  // Two crossed ribbons so the thin stem shows from every side.
  for (let k = 0; k < 2; k++) {
    const yaw = k * Math.PI / 2;
    const out = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const side = new Vector3(-out.z, 0, out.x);
    const rows = [0, 0.5, 1].map((f) => {
      const p = new Vector3(headX * f * f, STEM_HEIGHT * f, 0);
      const half = side.clone().multiplyScalar(0.007 * (1 - 0.3 * f));
      const c: Rgb = [0.78 + 0.2 * f, 0.84 + 0.16 * f, 0.7];
      return [parts.vertex(p.clone().sub(half), out, c, 1), parts.vertex(p.add(half), out, c, 1)];
    });
    for (let r = 0; r < 2; r++) {
      const [a, b] = rows[r];
      const [c, d] = rows[r + 1];
      parts.idx.push(a, c, b, b, c, d);
    }
  }
  const head = new Vector3(headX, STEM_HEIGHT, 0);
  const phase = rnd() * 0.5;
  for (let i = 0; i < PETALS; i++) {
    const yaw = ((i + phase) / PETALS) * Math.PI * 2;
    parts.blade({
      at: head.clone(), yaw, lift: 0.8, curl: 0.2, length: 0.065, width: 0.07,
      profile: [[0, 0.3], [0.3, 0.95], [0.6, 1], [0.85, 0.75], [0.97, 0.4]],
      upBlend: 0.6,
      color: (t) => { const s = 0.9 + 0.1 * t; return [s, s, s]; },
    });
  }
  // Small darker eye so the cup reads as a flower, not a flat star.
  const eye = parts.vertex(head.clone().add(new Vector3(0, 0.012, 0)), UP, [0.82, 0.62, 0.42]);
  const ring = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return parts.vertex(head.clone().add(new Vector3(Math.cos(a) * 0.018, 0.004, Math.sin(a) * 0.018)), UP, [0.9, 0.72, 0.5]);
  });
  ring.forEach((v, i) => parts.idx.push(eye, ring[(i + 1) % 6], v));
  return parts.geometry();
}

/** Same breeze and up-leaning normals as the grass; `stem` tints the stem part of the geometry, the rest takes the material colour. */
export function flowerMaterial(stem: Color): MeshStandardMaterial {
  return grassMaterial(0.8, (shader) => {
    shader.uniforms.uStem = { value: stem };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aStem;\nvarying float vStem;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStem = aStem;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vStem;\nuniform vec3 uStem;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uStem * 1.5 * vColor.rgb, vStem);");
  }, "-flower");
}

export function bushMaterial(): MeshStandardMaterial {
  return grassMaterial(0.5);
}

export function Plants({ spots, material, geometry, tint }: {
  spots: Spot[]; material: MeshStandardMaterial; geometry: () => BufferGeometry; tint: number;
}) {
  const geo = useMemo(geometry, [geometry]);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const c = new Color();
    spots.forEach(([x, z, rot, sc], k) => {
      im.setMatrixAt(k, m.compose(new Vector3(x, 0, z), q.setFromAxisAngle(UP, rot), s.setScalar(sc)));
      im.setColorAt(k, c.setScalar(1 - tint + tint * (0.5 + 0.5 * Math.sin(x * 1.3 + z * 0.9))));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }, [spots, tint]);
  useFrame((state) => { wind.value = state.clock.elapsedTime; });
  return <instancedMesh ref={ref} args={[geo, material, spots.length]} receiveShadow userData={{ noHalftone: true }} />;
}

export function Bushes({ spots, material }: { spots: Spot[]; material: MeshStandardMaterial }) {
  return <Plants spots={spots} material={material} geometry={bushGeometry} tint={0.12} />;
}

export function Flowers({ spots, material }: { spots: Spot[]; material: MeshStandardMaterial }) {
  return <Plants spots={spots} material={material} geometry={flowerGeometry} tint={0.1} />;
}
