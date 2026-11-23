import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MeshStandardMaterial, Vector3, type MeshStandardMaterialParameters, type PerspectiveCamera } from "three";
import { getRadioUi, setRadioUi, useRadioUi } from "./aim";
import { isTouchScreen } from "./Joystick";
import { isMuted, radio, setMuted } from "./Sound";
import { night } from "./theme";
import { RADIO } from "./town";

export const RADIO_URL = "https://radio.zhoucai.me";
const NEAR = 3.4; // m from the radio: close enough to use it
const VIEW = (65 * Math.PI) / 180; // and roughly facing it
const AIM_PAD = 18; // px of slack around a prompt when the crosshair picks it
const TOUCH = isTouchScreen();

const useRadio = () => useSyncExternalStore(radio.subscribe, radio.getSnapshot);

function toggleRadio() {
  const next = !radio.getSnapshot().on;
  if (next && isMuted()) setMuted(false); // turning the radio on should be audible
  radio.setOn(next);
}

// Station and volume live on the radio site, so settings just go there.
const openSettings = () => { window.open(RADIO_URL, "_blank", "noopener,noreferrer"); };

/** The radio on the red stall's counter. Close to it, two prompts hang either side of it and turn to face you:
 *  T turns it on and off, U opens its settings (the radio site). Keys, a tap, or the crosshair on a prompt all work. */
export default function Radio() {
  const { camera, gl } = useThree();
  const hud = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLButtonElement>(null);
  const right = useRef<HTMLAnchorElement>(null);
  const ui = useRadioUi();
  const state = useRadio();
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

  useFrame(({ size }) => {
    const base = new Vector3(RADIO.at[0], RADIO.y + 0.15, RADIO.at[1]);
    const to = base.sub(camera.position);
    const dist = to.length();
    const near = dist <= NEAR && to.angleTo(camera.getWorldDirection(new Vector3())) <= VIEW;
    if (near && !getRadioUi().near) radio.warm(); // fetch the station list now, so it can start inside the click
    let hover: "toggle" | "settings" | null = null;
    if (near && hud.current) {
      // Keep the prompts clear of the radio however close you are: half its width on screen, in px.
      const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
      const half = (0.3 / (Math.tan(fov / 2) * dist)) * (size.height / 2);
      hud.current.style.setProperty("--half", `${Math.round(half)}px`);
      if (document.pointerLockElement === gl.domElement) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const on = (el: HTMLElement | null) => {
          const r = el?.getBoundingClientRect();
          return !!r && cx > r.left - AIM_PAD && cx < r.right + AIM_PAD && cy > r.top - AIM_PAD && cy < r.bottom + AIM_PAD;
        };
        hover = on(left.current) ? "toggle" : on(right.current) ? "settings" : null;
      }
    }
    setRadioUi({ near, hover });
    mats.glow.emissiveIntensity = 0.3 + 1.6 * night.value + (radio.getSnapshot().on ? 0.6 : 0);
  });

  useEffect(() => {
    const canvas = gl.domElement;
    let wasLocked = false; // the click that locks the mouse must not also press a prompt
    const down = () => { wasLocked = document.pointerLockElement === canvas; };
    const click = () => {
      const { hover } = getRadioUi();
      if (!wasLocked || !hover) return;
      if (hover === "toggle") toggleRadio(); else openSettings();
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !getRadioUi().near) return;
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === "t") toggleRadio();
      else if (k === "u") openSettings();
      else return;
      e.preventDefault();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("click", click);
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("click", click);
      window.removeEventListener("keydown", key);
      setRadioUi({ near: false, hover: null });
    };
  }, [gl]);

  // Buttons never take focus, so Space (jump) and the arrows keep working for the world.
  const press = (fn: () => void) => ({
    tabIndex: -1,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.blur(); fn(); },
  });

  return (
    <>
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
      {ui.near && (
        <Html position={[RADIO.at[0], RADIO.y + 0.15, RADIO.at[1]]} center zIndexRange={[20, 0]}>
          <div className="radio-hud" ref={hud}>
            <button ref={left} className={`radio-pill left${ui.hover === "toggle" ? " aimed" : ""}${state.on ? " on" : ""}`} {...press(toggleRadio)}>
              {!TOUCH && <kbd>T</kbd>}{state.on ? "Turn off" : "Turn on"}
            </button>
            <a ref={right} className={`radio-pill right${ui.hover === "settings" ? " aimed" : ""}`} href={RADIO_URL} target="_blank" rel="noopener noreferrer" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}>
              {!TOUCH && <kbd>U</kbd>}Settings ↗
            </a>
          </div>
        </Html>
      )}
    </>
  );
}
