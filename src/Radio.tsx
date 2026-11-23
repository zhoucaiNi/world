import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MeshStandardMaterial, Vector3, type MeshStandardMaterialParameters } from "three";
import { setRadioAim } from "./aim";
import { night } from "./theme";
import { RADIO } from "./town";

export const RADIO_URL = "https://radio.zhoucai.me";
const RANGE = 3; // m from the camera
const CONE = (14 * Math.PI) / 180; // how far off the crosshair the radio may be
const TOUCH_CONE = (35 * Math.PI) / 180; // a tap is exact, so the radio only needs to be roughly in view

const open = () => window.open(RADIO_URL, "_blank", "noopener,noreferrer");

/** A small radio on the red stall's counter. Looking at it from close by offers a link to the radio site. */
export default function Radio() {
  const { camera, gl } = useThree();
  const aimed = useRef(false);
  const mats = useMemo(() => {
    const m = (color: string, extra: MeshStandardMaterialParameters = {}) => {
      const mat = new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
      mat.userData.htScale = 3; // dots this much finer: the radio is about 0.4 m wide
      return mat;
    };
    const glow = m("#ffe2a6", { emissive: "#ffb84a", emissiveIntensity: 0.3 });
    glow.userData.noHalftone = true;
    return { body: m("#c9553d"), trim: m("#f3e3c3"), dark: m("#3a2a22"), brass: m("#d9a441"), glow };
  }, []);

  useFrame(() => {
    const to = new Vector3(RADIO.at[0], RADIO.y + 0.15, RADIO.at[1]).sub(camera.position);
    const cone = document.pointerLockElement === gl.domElement ? CONE : TOUCH_CONE;
    const on = to.length() <= RANGE && to.angleTo(camera.getWorldDirection(new Vector3())) <= cone;
    if (on !== aimed.current) { aimed.current = on; setRadioAim(on); }
    mats.glow.emissiveIntensity = 0.3 + 1.6 * night.value;
  });

  // With the mouse locked to the view, a click on the radio (or Enter) opens it; touch uses the HUD button.
  useEffect(() => {
    const canvas = gl.domElement;
    let wasLocked = false; // the click that locks the mouse must not also open the link
    const down = () => { wasLocked = document.pointerLockElement === canvas; };
    const click = () => { if (wasLocked && aimed.current) open(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Enter" && !e.repeat && aimed.current) open(); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("click", click);
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("click", click);
      window.removeEventListener("keydown", key);
      setRadioAim(false);
    };
  }, [gl]);

  return (
    <group position={[RADIO.at[0], RADIO.y, RADIO.at[1]]} rotation={[0, RADIO.rot, 0]}>
      <mesh position={[0, 0.15, 0]} material={mats.body} castShadow>
        <boxGeometry args={[0.46, 0.3, 0.18]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={mats.trim}>
        <boxGeometry args={[0.48, 0.02, 0.2]} />
      </mesh>
      {/* speaker grille */}
      <mesh position={[-0.1, 0.14, 0.092]} material={mats.trim}>
        <boxGeometry args={[0.2, 0.2, 0.006]} />
      </mesh>
      {[-0.06, -0.02, 0.02, 0.06].map((y) => (
        <mesh key={y} position={[-0.1, 0.14 + y, 0.097]} material={mats.dark}>
          <boxGeometry args={[0.17, 0.012, 0.006]} />
        </mesh>
      ))}
      {/* tuning window and dial */}
      <mesh position={[0.12, 0.21, 0.092]} material={mats.glow} userData={{ noHalftone: true }}>
        <boxGeometry args={[0.15, 0.06, 0.006]} />
      </mesh>
      <mesh position={[0.12, 0.21, 0.097]} material={mats.dark}>
        <boxGeometry args={[0.004, 0.05, 0.006]} />
      </mesh>
      <mesh position={[0.12, 0.1, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={mats.brass}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 14]} />
      </mesh>
      <mesh position={[0.12, 0.1, 0.116]} material={mats.dark}>
        <boxGeometry args={[0.006, 0.05, 0.006]} />
      </mesh>
      {/* antenna */}
      <mesh position={[0.17, 0.46, 0]} rotation={[0, 0, -0.35]} material={mats.dark}>
        <cylinderGeometry args={[0.006, 0.006, 0.34, 6]} />
      </mesh>
      <mesh position={[0.23, 0.62, 0]} material={mats.brass}>
        <sphereGeometry args={[0.015, 8, 6]} />
      </mesh>
    </group>
  );
}
