// Distance LOD, culling and batching for instanced vegetation (used by the Jurassic layers in Prehistoric.tsx).
// A <LodInstances> keeps one InstancedMesh per (level, kind, material). On a throttle (the camera moved ~15 cm or turned ~0.6 deg)
// every instance is sorted into a level by its distance (with hysteresis, so nothing flickers at a border) or dropped when
// it is behind the fog's far distance or outside the view frustum. All buffers are preallocated; nothing is allocated per frame.
import { createElement, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Box3, DynamicDrawUsage, Frustum, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3,
  type BufferGeometry, type Camera, type Material,
} from "three";

export type LodPart = { geometry: BufferGeometry; material: Material };
/** `groups[k]` are the parts drawn for kind `k` (one group = every kind shares it). `until`: metres at which the next level takes over. */
export type LodLevel = { groups: LodPart[][]; until: number; every?: number }; // every: draw only each n-th instance at this level

const HYSTERESIS = 1.5; // m
const MOVE = 0.15; // m of camera travel that triggers a re-sort
const TURN = 0.99995; // cos of the camera turn (~0.6 deg) that triggers a re-sort
const frustum = new Frustum();
const pv = new Matrix4();
const inv = new Matrix4();
const view = { stamp: -1, version: 0, x: NaN, y: 0, z: 0, fx: 0, fy: 0, fz: -1, k: 0 };

/** Once per frame: has the camera moved or turned enough since the last re-sort? If so bump `version` and rebuild the frustum. */
function syncView(camera: Camera, stamp: number) {
  if (view.stamp === stamp) return;
  view.stamp = stamp;
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  const fx = -e[8], fy = -e[9], fz = -e[10];
  const k = camera.projectionMatrix.elements[0] + camera.projectionMatrix.elements[5];
  const moved = Math.hypot(e[12] - view.x, e[13] - view.y, e[14] - view.z) > MOVE;
  if (!(moved || fx * view.fx + fy * view.fy + fz * view.fz < TURN || k !== view.k)) return;
  view.x = e[12]; view.y = e[13]; view.z = e[14]; view.fx = fx; view.fy = fy; view.fz = fz; view.k = k;
  view.version++;
  inv.copy(camera.matrixWorld).invert();
  pv.multiplyMatrices(camera.projectionMatrix, inv);
  frustum.setFromProjectionMatrix(pv);
}

type Bucket = { meshes: InstancedMesh[]; mat: InstancedBufferAttribute; col: InstancedBufferAttribute | null; count: number };

/** Bounding sphere (local centre + radius) of a group of parts. */
function localSphere(parts: LodPart[]) {
  const box = new Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const c = box.getCenter(new Vector3());
  return { c, r: box.getSize(new Vector3()).length() / 2 };
}

export function LodInstances({ levels, matrices, colors, kinds, cull, pad = 0.6, always = 0, castShadow = false, halftone = false }: {
  levels: LodLevel[];
  matrices: Float32Array; // n * 16, column-major
  colors?: Float32Array; // n * 3
  kinds?: Uint8Array; // n; which group of each level an instance uses (default 0)
  cull: number; // view depth (m) beyond which nothing is drawn (the instance's own radius is allowed for)
  pad?: number; // extra radius for the frustum test; use the shadow length for things that cast shadows
  always?: number; // instances nearer than this skip the frustum test (their shadows can fall into view)
  castShadow?: boolean;
  halftone?: boolean;
}) {
  const n = matrices.length / 16;
  const state = useMemo(() => {
    const groups = Math.max(...levels.map((l) => l.groups.length));
    const spheres = Array.from({ length: groups }, (_, k) => localSphere(levels[0].groups[Math.min(k, levels[0].groups.length - 1)]));
    // World sphere of every instance: x, y, z, radius.
    const sph = new Float32Array(n * 4);
    const v = new Vector3();
    for (let i = 0; i < n; i++) {
      const s = spheres[kinds ? kinds[i] : 0];
      const m = matrices.subarray(i * 16, i * 16 + 16);
      const sc = Math.hypot(m[0], m[1], m[2]);
      v.copy(s.c).applyMatrix4(tmp.fromArray(m));
      sph.set([v.x, v.y, v.z, s.r * sc], i * 4);
    }
    const root = new Group();
    const buckets: Bucket[][] = levels.map((lv) => lv.groups.map((parts) => {
      const mat = new InstancedBufferAttribute(new Float32Array(n * 16), 16).setUsage(DynamicDrawUsage);
      const col = colors ? new InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage) : null;
      const meshes = parts.map((p) => {
        const mesh = new InstancedMesh(p.geometry, p.material, n);
        mesh.instanceMatrix = mat; // the parts of one group share a single buffer
        if (col) mesh.instanceColor = col;
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false; // culled by hand above
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        if (!halftone) mesh.userData.noHalftone = true;
        root.add(mesh);
        return mesh;
      });
      return { meshes, mat, col, count: 0 };
    }));
    return { root, buckets, sph, level: new Uint8Array(n), seen: -1 };
  }, [levels, matrices, colors, kinds, castShadow, halftone, n]);

  useEffect(() => () => state.root.children.forEach((m) => (m as InstancedMesh).dispose()), [state]);

  useFrame(({ camera, clock }) => {
    syncView(camera, clock.elapsedTime);
    if (state.seen === view.version) return;
    state.seen = view.version;
    const { buckets, sph, level } = state;
    const last = levels.length - 1;
    for (const lv of buckets) for (const b of lv) b.count = 0;
    const planes = frustum.planes;
    for (let i = 0; i < n; i++) {
      const dx = sph[i * 4] - view.x, dy = sph[i * 4 + 1] - view.y, dz = sph[i * 4 + 2] - view.z, r = sph[i * 4 + 3];
      if (dx * view.fx + dy * view.fy + dz * view.fz - r > cull) continue;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > always + r) {
        const rr = r + pad;
        const cx = sph[i * 4], cy = sph[i * 4 + 1], cz = sph[i * 4 + 2];
        let out = false;
        for (let p = 0; p < 6 && !out; p++) {
          const pl = planes[p];
          out = pl.normal.x * cx + pl.normal.y * cy + pl.normal.z * cz + pl.constant < -rr;
        }
        if (out) continue;
      }
      let l = level[i];
      while (l < last && d > levels[l].until + HYSTERESIS) l++;
      while (l > 0 && d < levels[l - 1].until - HYSTERESIS) l--;
      level[i] = l;
      const every = levels[l].every;
      if (every && i % every) continue;
      const b = buckets[l][Math.min(kinds ? kinds[i] : 0, buckets[l].length - 1)];
      const dst = b.mat.array as Float32Array, o = b.count * 16, s = i * 16;
      for (let k = 0; k < 16; k++) dst[o + k] = matrices[s + k];
      if (b.col) {
        const cd = b.col.array as Float32Array;
        for (let k = 0; k < 3; k++) cd[b.count * 3 + k] = colors![i * 3 + k];
      }
      b.count++;
    }
    for (const lv of buckets) {
      for (const b of lv) {
        for (const m of b.meshes) { m.count = b.count; m.visible = b.count > 0; }
        if (!b.count) continue;
        b.mat.clearUpdateRanges();
        b.mat.addUpdateRange(0, b.count * 16);
        b.mat.needsUpdate = true;
        if (b.col) {
          b.col.clearUpdateRanges();
          b.col.addUpdateRange(0, b.count * 3);
          b.col.needsUpdate = true;
        }
      }
    }
  });

  return createElement("primitive", { object: state.root });
}

const tmp = new Matrix4();
