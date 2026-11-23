import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { SEATS, TOWN, keepClear, live, type Seat } from "./town";
import { night } from "./theme";
import { updateSound } from "./Sound";
import { FOUNTAIN_AT } from "./Fountain";
import { stick } from "./Joystick";

const EYE = 1.2; // eye height
const SPEED = 4;
const MOUSE_LOOK = 0.0025; // rad per mouse count while the pointer is locked
const TOUCH_LOOK = 0.004; // rad per dragged pixel on touch screens
const PITCH_MIN = -0.7;
const PITCH_MAX = 0.5;
const RADIUS = 0.4;
const JUMP_SPEED = 5; // m/s up; with GRAVITY that peaks at about 0.9 m, 0.7 s in the air
const GRAVITY = 14; // stronger than real so the hop feels snappy, not floaty
const LAND_DIP = 0.08; // the eye sinks this far on landing, then springs back
const SEAT_EYE = EYE * 0.75; // seated eye height: the seat top is 0.56
const SEAT_PITCH = -0.05;
const SEAT_REACH = 1.8; // how close to a seat centre offers it
const SIT_TIME = 0.6; // seconds to ease onto or off the seat
const KEYS: Record<string, string> = {
  w: "forward", arrowup: "forward", s: "back", arrowdown: "back",
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
};

export type SeatPrompt = "sit" | "stand" | null;
type Pose = { x: number; z: number; yaw: number; pitch: number; eye: number };

/** Sit or stand at the nearest seat: the HUD prompt calls this (E and Esc do the same). */
export const seat = { toggle: () => {} };

/** First-person visitor: click to lock the mouse and look around, WASD or arrows to walk.
 *  Touch screens drag to look, since they can't lock a pointer. */
export default function Player({ onSeat }: { onSeat: (s: SeatPrompt) => void }) {
  const pos = useRef(new Vector3(TOWN.spawn[0], 0, TOWN.spawn[1]));
  const yaw = useRef(0); // 0 looks toward -z, north up the lane to the fountain
  const pitch = useRef(-0.08);
  const held = useRef(new Set<string>());
  const air = useRef({ y: 0, vy: 0, dip: 0 }); // height above ground, vertical speed, landing dip
  const sit = useRef<{ bench: Seat; down: boolean; t: number; from: Pose; to: Pose } | null>(null);
  const near = useRef<Seat | null>(null);
  const prompt = useRef<SeatPrompt>(null);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => {
    camera.rotation.order = "YXZ";
    // Ease from where the camera is now to `to`; each press restarts from the current pose, so it can interrupt.
    const go = (bench: Seat, down: boolean, to: Pose) => {
      const from = { x: pos.current.x, z: pos.current.z, yaw: yaw.current, pitch: pitch.current, eye: camera.position.y };
      sit.current = { bench, down, t: 0, from, to };
      held.current.clear();
      air.current = { y: 0, vy: 0, dip: 0 };
    };
    seat.toggle = () => {
      const s = sit.current;
      if (!s) {
        const b = near.current;
        if (!b) return;
        if (document.pointerLockElement) document.exitPointerLock();
        go(b, true, { x: b.at[0], z: b.at[1], yaw: b.yaw, pitch: SEAT_PITCH, eye: SEAT_EYE });
      } else if (s.down) {
        go(s.bench, false, { x: s.bench.stand[0], z: s.bench.stand[1], yaw: yaw.current, pitch: pitch.current, eye: EYE });
      }
    };
    const look = (dx: number, dy: number, rate: number) => {
      yaw.current -= dx * rate;
      pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current - dy * rate));
    };
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key.toLowerCase() === "e" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { seat.toggle(); return; }
      if (sit.current) { // locked: movement keys and Esc stand up, nothing else acts
        if (!e.repeat && (e.key === "Escape" || KEYS[e.key.toLowerCase()]) && sit.current.down) seat.toggle();
        if (e.code === "Space" || e.key.startsWith("Arrow")) e.preventDefault();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault(); // keep the page from scrolling
        if (air.current.y === 0 && !e.repeat) air.current.vy = JUMP_SPEED;
        return;
      }
      const k = KEYS[e.key.toLowerCase()];
      if (!k) return;
      held.current.add(k);
      if (e.key.startsWith("Arrow")) e.preventDefault(); // keep the arrows from scrolling the page
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.key.toLowerCase()];
      if (k) held.current.delete(k);
    };
    // Esc or switching tabs releases the lock, and keyups may never arrive: stop walking.
    const release = () => held.current.clear();

    let drag: { id: number; x: number; y: number } | null = null;
    const pDown = (e: PointerEvent) => {
      if (sit.current) return;
      if (e.pointerType === "mouse") {
        if (document.pointerLockElement !== canvas) {
          // Rejects if asked again too soon after Esc; the next click tries again.
          Promise.resolve(canvas.requestPointerLock()).catch(() => {});
        }
        return;
      }
      if (!drag) drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const pMove = (e: PointerEvent) => {
      if (sit.current) return;
      if (document.pointerLockElement === canvas) { look(e.movementX, e.movementY, MOUSE_LOOK); return; }
      if (!drag || e.pointerId !== drag.id) return;
      if (e.buttons === 0) { drag = null; return; }
      look(e.clientX - drag.x, e.clientY - drag.y, TOUCH_LOOK);
      drag = { id: drag.id, x: e.clientX, y: e.clientY };
    };
    const pUp = (e: PointerEvent) => { if (drag && e.pointerId === drag.id) drag = null; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    canvas.addEventListener("pointerdown", pDown);
    window.addEventListener("pointermove", pMove);
    window.addEventListener("pointerup", pUp);
    window.addEventListener("pointercancel", pUp);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      canvas.removeEventListener("pointerdown", pDown);
      window.removeEventListener("pointermove", pMove);
      window.removeEventListener("pointerup", pUp);
      window.removeEventListener("pointercancel", pUp);
    };
  }, [camera, canvas]);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
    const p = pos.current;
    const h = held.current;

    const fwd = new Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new Vector3(-fwd.z, 0, fwd.x);
    const dir = new Vector3();
    if (h.has("forward")) dir.add(fwd);
    if (h.has("back")) dir.sub(fwd);
    if (h.has("right")) dir.add(right);
    if (h.has("left")) dir.sub(right);

    // Keyboard keeps full speed; the stick scales it by how far it is pushed.
    let speed = SPEED;
    if (dir.lengthSq() > 0) dir.normalize();
    else speed *= Math.min(1, Math.hypot(stick.x, stick.y));
    dir.addScaledVector(fwd, stick.y).addScaledVector(right, stick.x);
    const s = sit.current;
    const moving = !s && dir.lengthSq() > 0;
    let eye = 0;
    if (s) {
      s.t = Math.min(1, s.t + dt / SIT_TIME);
      const e = s.t * s.t * (3 - 2 * s.t);
      const { from, to } = s;
      const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw)); // shortest way round
      p.x = from.x + (to.x - from.x) * e;
      p.z = from.z + (to.z - from.z) * e;
      yaw.current = from.yaw + turn * e;
      pitch.current = from.pitch + (to.pitch - from.pitch) * e;
      eye = from.eye + (to.eye - from.eye) * e;
      if (!s.down && s.t >= 1) sit.current = null;
      else if (s.down && s.t >= 1 && (stick.x || stick.y)) seat.toggle(); // the stick stands up too
    } else {
      if (moving) p.addScaledVector(dir.normalize(), speed * dt);
      keepClear(p, RADIUS);
    }

    let nb: Seat | null = null;
    let nearest = SEAT_REACH;
    if (!sit.current) for (const b of SEATS) {
      const d = Math.hypot(p.x - b.at[0], p.z - b.at[1]);
      if (d < nearest) { nearest = d; nb = b; }
    }
    near.current = nb;
    const want: SeatPrompt = sit.current ? (sit.current.down ? "stand" : null) : nb ? "sit" : null;
    if (want !== prompt.current) { prompt.current = want; onSeat(want); }

    updateSound(
      Math.hypot(p.x - TOWN.campfire[0], p.z - TOWN.campfire[1]),
      Math.hypot(p.x - FOUNTAIN_AT[0], p.z - FOUNTAIN_AT[1]),
      night.value,
    );
    live.player.x = p.x;
    live.player.z = p.z;
    live.player.yaw = yaw.current;

    const a = air.current;
    if (a.y > 0 || a.vy > 0) {
      a.vy -= GRAVITY * dt;
      a.y += a.vy * dt;
      if (a.y <= 0) { a.y = 0; a.vy = 0; a.dip = LAND_DIP; }
    }
    a.dip *= Math.max(0, 1 - 12 * dt);

    const bob = moving && a.y === 0 ? Math.sin(state.clock.elapsedTime * 9) * 0.035 : 0;
    camera.position.set(p.x, s ? eye : EYE + a.y - a.dip + bob, p.z);
    camera.rotation.set(pitch.current, yaw.current, 0);
  });

  return null;
}
