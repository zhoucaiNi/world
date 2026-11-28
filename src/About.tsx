import { useEffect, useRef, type ReactNode } from "react";
import { WORLD } from "./worldConfig";

export function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.8" />
      <path d="M12 17h.01" />
    </svg>
  );
}

const icon = (children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const WALK = icon(<path d="m3 11 19-9-9 19-2-8z" />);
const PAW = icon(
  <>
    <circle cx="5.5" cy="11" r="1.8" />
    <circle cx="9.5" cy="6" r="1.8" />
    <circle cx="15.5" cy="6" r="1.8" />
    <circle cx="19.5" cy="11" r="1.8" />
    <path d="M12.5 11.5c-3 0-5.5 3-4.7 5.8.6 2 3 1.8 4.7 1 1.7.8 4.1 1 4.7-1 .8-2.8-1.7-5.8-4.7-5.8z" />
  </>,
);
const FLAME = icon(<path d="M12 3c.6 3.2 5 5.2 5 10a5 5 0 0 1-10 0c0-2 .9-3.2 2.2-4.2 0 1.8.8 2.9 1.8 3.2C10.2 8 11 6 12 3z" />);

/** What this place is, and what to do in it. A card over a dimmed backdrop; Esc, the backdrop or the button close it. */
export default function About({ onClose, touch }: { onClose: () => void; touch: boolean }) {
  const close = useRef<HTMLButtonElement>(null);

  // Move focus into the card (so its keys don't reach the walking handlers), and give it back on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => before?.focus();
  }, []);

  const tap = touch ? "Tap" : "Click";
  return (
    <div className="about-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="about" role="dialog" aria-modal="true" aria-labelledby="about-title"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <span className="about-badge"><i aria-hidden="true" />Work in progress</span>
        <h2 id="about-title">Welcome to the world</h2>
        <p className="about-intro">{WORLD.text.intro}</p>
        <ul className="about-list">
          <li>
            <span className="about-icon">{WALK}</span>
            <div>
              <b>Look around and walk</b>
              <p>{touch ? "Drag to look, and use the stick to walk." : "Click to look, then WASD or the arrow keys to walk. Esc frees the mouse."}</p>
            </div>
          </li>
          <li>
            <span className="about-icon">{PAW}</span>
            <div>
              <b>Pet the dog</b>
              <p>{WORLD.text.dogAbout} Walk up to it, look at it and {tap.toLowerCase()} to pet it.</p>
            </div>
          </li>
          <li>
            <span className="about-icon">{FLAME}</span>
            <div>
              <b>Sit by the campfire</b>
              <p>{touch ? "Tap Sit" : "Press E"} when you're close to a log or a bench, and watch the fire.</p>
            </div>
          </li>
        </ul>
        <button ref={close} type="button" className="about-close" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
