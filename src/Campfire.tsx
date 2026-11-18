import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ConeGeometry, MeshBasicMaterial, type Mesh, type PointLight } from "three";
import { Batch, nature, trs, type Placement, type Swap } from "./Kit";
import { night } from "./theme";
import { TOWN } from "./town";

const SCALE = 3; // kit campfire is ~0.5 wide -> ~1.6
// [x, z, radius, height, colour, phase] per flame cone; inner yellow, outer orange.
const FLAMES: [number, number, number, number, string, number][] = [
  [0, 0, 0.32, 1.1, "#ff8a2a", 0],
  [0.14, 0.08, 0.22, 0.8, "#ffb03a", 1.7],
  [-0.12, -0.06, 0.2, 0.75, "#ffb03a", 3.1],
  [0, 0, 0.16, 0.7, "#ffe27a", 4.4],
];

/** Kenney Nature Kit campfire (CC0) with animated flames and a flickering light. */
export default function Campfire({ swap }: { swap: Swap }) {
  const [x, z] = TOWN.campfire;
  const flames = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const mats = useMemo(() => FLAMES.map(([, , , , c]) => new MeshBasicMaterial({ color: c })), []);
  // Pivot at the base so the flicker grows upward.
  const geos = useMemo(() => FLAMES.map(([, , r, h]) => new ConeGeometry(r, h, 7).translate(0, h / 2, 0)), []);
  const kit = useMemo(
    () => ["campfire_stones", "campfire_logs"].map((n): Placement => ({ url: nature(n), swap, matrix: trs(0, 0, 0, 0, SCALE) })),
    [swap],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    flames.current.forEach((f, i) => {
      if (!f) return;
      const ph = FLAMES[i][5];
      const flick = 0.8 + 0.2 * Math.sin(t * 9 + ph) + 0.1 * Math.sin(t * 23 + ph * 2);
      f.scale.set(1, flick, 1);
      f.rotation.z = Math.sin(t * 3 + ph) * 0.08;
    });
    if (light.current) {
      const flicker = 0.85 + 0.1 * Math.sin(t * 11) + 0.05 * Math.sin(t * 29);
      light.current.intensity = (4 + 24 * night.value) * flicker;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <Batch items={kit} />
      {FLAMES.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(el) => { flames.current[i] = el; }}
          position={[x, 0.12, z]}
          geometry={geos[i]}
          material={mats[i]}
          userData={{ noHalftone: true }}
        />
      ))}
      <pointLight ref={light} position={[0, 0.9, 0]} distance={11} color="#ff9a4a" />
    </group>
  );
}
