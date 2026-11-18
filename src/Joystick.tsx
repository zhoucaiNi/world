import { useRef } from "react";

/** Analogue walk input in [-1, 1]²: x right, y forward. Player reads it every frame. */
export const stick = { x: 0, y: 0 };

const BASE = 110;
const KNOB = 46;
const TRAVEL = (BASE - KNOB) / 2;
const DEAD = 0.12;

export const isTouchScreen = () => window.matchMedia("(pointer: coarse)").matches;

export default function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const drive = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > TRAVEL) { dx = (dx / len) * TRAVEL; dy = (dy / len) * TRAVEL; }
    knob.current!.style.transition = "none";
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy) / TRAVEL;
    if (m < DEAD) { stick.x = 0; stick.y = 0; return; }
    // Rescale so the output ramps from 0 at the dead zone edge rather than jumping to DEAD.
    const k = (m - DEAD) / (1 - DEAD) / m;
    stick.x = (dx / TRAVEL) * k;
    stick.y = (-dy / TRAVEL) * k;
  };
  const release = (e: React.PointerEvent) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    stick.x = 0;
    stick.y = 0;
    knob.current!.style.transition = "transform 120ms ease-out";
    knob.current!.style.transform = "";
  };

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        if (active.current !== null) return;
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        drive(e);
      }}
      onPointerMove={(e) => { if (e.pointerId === active.current) drive(e); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={knob} className="joystick-knob" />
    </div>
  );
}
