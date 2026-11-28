import { useEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Shape, ShapeGeometry, Vector3, type Bone, type Group } from "three";
import { TOWN, blocked, keepClear, live, pondRadius } from "./town";
import { setAim } from "./aim";
import { petDog } from "./affection";
import { DEBUG, debugActions } from "./debug";

// The Jurassic world's animal: it wanders between spots, now and then goes to the watering hole to drink, and answers being petted.
// (The town's shiba is a separate component, Shiba.tsx.)
//
// "Animated LowPoly Dinosaurs" Stegosaurus by Quaternius (CC0), https://quaternius.itch.io/animated-lowpoly-dinosaurs
// Clips: Stegosaurus_Idle, _Walk, _Run, _Attack, _Jump, _Death. There is no drink clip, so drinking bends the neck and head bones.
const DINO_URL = "/models/jurassic/animal/stegosaurus.glb";
const SCALE = 0.2; // ~22 units nose to tail facing +z, plates ~10 high: ~4.4 m long, ~2 m to the plate tips, ~1.3 m at the shoulder
const WALK_CLIP = "Stegosaurus_Walk"; // 2.9 s; the back feet cover ~0.5 m/s at timeScale 1
const IDLE_CLIP = "Stegosaurus_Idle";
const NECK_BONE = "Neck";
const HEAD_BONE = "Head";

const SPEED = 0.8; // m/s it roams at (the walk clip is sped up to match)
const STRIDE = 0.5; // m/s the walk clip covers at timeScale 1, so the feet don't slide
const ACCEL = 1; // m/s², so it eases into a walk and settles to a stop
const TURN_RATE = 1.2; // rad/s: a heavy animal turns slowly
const ROAM = 18; // wanders within this radius of the town centre
const RADIUS = 1.1;
const WALK_ABOVE = 0.25; // m/s actually covered before the legs start walking
const IDLE_BELOW = 0.1; // and below which they stop, so it doesn't flicker between clips
const WAIT: [number, number] = [3, 7]; // s it stands still between walks

const BANK_CHANCE = 0.35; // of its walks that go to the watering hole
const FORCE_WALK = 15; // s (debug) it tries to walk to the pond before being put on the bank instead
const NOSE = 1.5; // m its nose reaches ahead of its centre
const DRINK_FOR: [number, number] = [6, 9]; // s at the water
const HEAD_EASE = 3; // 1/s: how quickly the head lowers to the water and comes back up
const NECK_DOWN = 0.5; // rad the neck bends down at the water
const HEAD_DOWN = 0.25; // rad more at the head

const PET_RANGE = 4; // m from the camera
const PET_CONE = (12 * Math.PI) / 180; // how far off the crosshair the animal may be
const PET_TOUCH_CONE = (35 * Math.PI) / 180; // a tap is exact, so "Tap to pet" only needs the animal roughly in view
const PET_COOLDOWN = 0.8;
const PET_PROMPT_QUIET = 1.5; // s after a pet before the prompt returns
const PET_TURN_RATE = TURN_RATE * 1.5; // rad/s: it turns to you a little quicker than it wanders
const PET_ANIM = 1.2; // s: the heart's life, and how long it keeps facing you
const PET_REST = 3; // s it stands there after that before wandering again
const PET_HOP = 0.1; // m: a tiny jump as it notices you (the whole body lifts; the model's own jump clip is a full leap)
const PET_HOP_TIME = 0.4; // s
const HEAD_Y = 2.1; // m, about the top of the head
const HEART_RISE = 0.6;
const HEART_SIZE = 0.2;

const rand = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);

const heartGeometry = (() => {
  const s = new Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.35, -0.5, -0.1, -0.5, 0.15);
  s.bezierCurveTo(-0.5, 0.42, -0.2, 0.5, 0, 0.28);
  s.bezierCurveTo(0.2, 0.5, 0.5, 0.42, 0.5, 0.15);
  s.bezierCurveTo(0.5, -0.1, 0.15, -0.35, 0, -0.5);
  return new ShapeGeometry(s);
})();

/** True when nothing solid sits on the straight line from a to b. */
function clearLine(a: Vector3, b: Vector3) {
  const d = a.distanceTo(b);
  for (let s = 0.5; s < d; s += 0.5) {
    const t = s / d;
    if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, RADIUS + 0.2)) return false;
  }
  return true;
}

/** A random spot it can walk straight to, not inside or right against anything solid. */
function pickRoam(from: Vector3): Vector3 | null {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * ROAM;
    const v = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (v.distanceTo(from) > 3 && !blocked(v.x, v.z, RADIUS + 1) && clearLine(from, v)) return v;
  }
  return null;
}

/** A spot on the pond's bank where its nose reaches just into the water, or null if the pond is out or nothing there is free.
 *  Normally it must also be a clear straight walk from `from`; `anywhere` (debug) drops that and the distance check. */
function pickBank(from: Vector3, anywhere = false): Vector3 | null {
  const pond = TOWN.pond;
  if (!pond) return null;
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = pondRadius(a) + NOSE - 0.3;
    const v = new Vector3(pond.at[0] + Math.cos(a) * r, 0, pond.at[1] + Math.sin(a) * r);
    if (!blocked(v.x, v.z, RADIUS + 0.2) && (anywhere || (v.distanceTo(from) > 3 && clearLine(from, v)))) return v;
  }
  return null;
}

/** Debug only: when no bank spot has a clear straight line, a clear spot noticeably nearer the pond to walk to first. */
function pickTowardPond(from: Vector3): Vector3 | null {
  const pond = TOWN.pond;
  if (!pond) return null;
  const here = Math.hypot(from.x - pond.at[0], from.z - pond.at[1]);
  let best: Vector3 | null = null;
  let bestD = here - 1.5;
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * ROAM;
    const v = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const d = Math.hypot(v.x - pond.at[0], v.z - pond.at[1]);
    if (d < bestD && v.distanceTo(from) > 2 && !blocked(v.x, v.z, RADIUS + 1) && clearLine(from, v)) { best = v; bestD = d; }
  }
  return best;
}

type Mode = "wait" | "walk" | "face" | "drink" | "pet"; // standing, walking to a spot, turning to the water, drinking, answering a pet

export default function Dino() {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(DINO_URL);
  const { actions } = useAnimations(animations, root);
  const playing = useRef<string | null>(null);
  const bones = useRef<{ neck: Bone | null; head: Bone | null }>({ neck: null, head: null });
  const speed = useRef(0); // commanded, eased toward the wanted speed
  const pace = useRef(0); // ground actually covered (m/s, smoothed): drives the legs
  const lowered = useRef(0); // 0 head up .. 1 head at the water, eased
  const petAt = useRef(-Infinity);
  const forceDrink = useRef(false); // debug: the next walk goes to the pond
  const forceSince = useRef(0); // debug: when that was asked for
  const pressedWith = useRef("mouse"); // what the last press on the canvas was: the click after a tap says "mouse" in Safari
  const heart = useRef<Mesh>(null);
  const heartMat = useRef<MeshBasicMaterial>(null);
  const st = useRef({ mode: "wait" as Mode, until: 1.5, target: null as Vector3 | null, bank: false, stuck: 0, since: 0, dur: 0 });
  const q = useRef({ side: new Vector3(), qg: new Quaternion(), qp: new Quaternion(), qr: new Quaternion() });
  const { camera, gl, clock } = useThree();

  const pet = () => {
    const now = clock.elapsedTime;
    if (now - petAt.current < PET_COOLDOWN) return;
    petAt.current = now;
    petDog();
    const s = st.current;
    s.mode = "pet";
    s.target = null;
    s.stuck = 0;
  };

  // The one test for "the animal is within reach and in view", shared by the click and the on-screen cue.
  const inReach = (cone: number) => {
    const g = root.current;
    if (!g) return false;
    const to = new Vector3(g.position.x, 0.5, g.position.z).sub(camera.position);
    return Math.hypot(to.x, to.z) <= PET_RANGE && to.angleTo(camera.getWorldDirection(new Vector3())) <= cone;
  };

  useEffect(() => () => setAim("off"), []);

  // Mouse: pointer-locked click on whatever the crosshair is on. Touch taps go through onClick below.
  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: PointerEvent) => {
      pressedWith.current = e.pointerType;
      if (e.pointerType === "touch" || e.button !== 0 || document.pointerLockElement !== canvas) return;
      if (inReach(PET_CONE)) pet();
    };
    canvas.addEventListener("pointerdown", onDown);
    return () => canvas.removeEventListener("pointerdown", onDown);
  }, [gl, camera]);

  // Debug (`&debug`): send it to the pond to drink right now, from the "Go drink" button or the G key.
  useEffect(() => {
    if (!DEBUG) return;
    const go = () => { const s = st.current; forceDrink.current = true; forceSince.current = clock.elapsedTime; s.mode = "wait"; s.until = 0; s.target = null; };
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "g" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) go(); };
    debugActions.drink = go;
    window.addEventListener("keydown", onKey);
    return () => { debugActions.drink = () => {}; window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    scene.traverse((o) => { o.castShadow = true; });
    bones.current = { neck: scene.getObjectByName(NECK_BONE) as Bone | null, head: scene.getObjectByName(HEAD_BONE) as Bone | null };
  }, [scene]);

  /** Rotates a bone about the animal's own side axis, whatever the bone's rest orientation. Applied on top of the clip each frame. */
  const bend = (g: Group, bone: Bone, angle: number) => {
    if (!bone.parent) return;
    const { side, qg, qp, qr } = q.current;
    g.getWorldQuaternion(qg);
    side.set(1, 0, 0).applyQuaternion(qg);
    qr.setFromAxisAngle(side, angle);
    bone.parent.getWorldQuaternion(qp);
    qr.premultiply(qp.clone().invert()).multiply(qp); // world rotation -> the bone parent's frame
    bone.quaternion.premultiply(qr);
  };

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    dt = Math.min(dt, 0.05);
    const now = state.clock.elapsedTime;
    const s = st.current;
    let want = 0; // m/s it is trying to walk
    let turning = false; // turning on the spot, which steps its feet

    const sincePet = now - petAt.current;
    const cone = document.pointerLockElement === gl.domElement ? PET_CONE : PET_TOUCH_CONE;
    setAim(!inReach(cone) ? "off" : sincePet < PET_PROMPT_QUIET ? "petted" : "aimed");

    if (s.mode === "wait" && now >= s.until) {
      const forced = forceDrink.current;
      const bank = forced || Math.random() < BANK_CHANCE ? pickBank(g.position) : null;
      if (forced && !bank) {
        // asked to drink but no bank spot is in a clear line from here: step toward the pond through free ground and try again,
        // and if that takes too long (trees and rocks in the way) put it on the bank
        const hop = now - forceSince.current < FORCE_WALK ? pickTowardPond(g.position) : null;
        if (hop) { s.target = hop; s.bank = false; s.stuck = 0; s.mode = "walk"; }
        else if (now - forceSince.current >= FORCE_WALK) {
          const spot = pickBank(g.position, true);
          if (spot) { g.position.copy(spot); speed.current = 0; forceDrink.current = false; s.mode = "face"; }
          else s.until = now + 0.5;
        } else s.until = now + 0.5;
      } else {
        const spot = bank ?? pickRoam(g.position);
        if (spot) { s.target = spot; s.bank = !!bank; s.stuck = 0; s.mode = "walk"; forceDrink.current = false; }
        else s.until = now + 1;
      }
    }

    if (s.mode === "walk" && s.target) {
      const dir = new Vector3().subVectors(s.target, g.position).setY(0);
      const dist = dir.length();
      if (dist < 0.3) {
        s.target = null;
        if (s.bank) s.mode = "face";
        else { s.mode = "wait"; s.until = now + (forceDrink.current ? 0 : rand(WAIT)); }
      } else {
        // Turn toward the target at a steady rate and walk the way it's facing, so it arcs.
        let diff = Math.atan2(dir.x, dir.z) - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
        // Slower through sharp turns, and slowing down over the last metre.
        want = SPEED * (0.35 + 0.65 * Math.max(0, Math.cos(diff))) * Math.min(1, dist);
      }
    }

    if (s.mode === "face" && TOWN.pond) {
      let diff = Math.atan2(TOWN.pond.at[0] - g.position.x, TOWN.pond.at[1] - g.position.z) - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
      turning = Math.abs(diff) > 0.05;
      if (!turning) { s.mode = "drink"; s.since = now; s.dur = rand(DRINK_FOR); }
    }

    if (s.mode === "drink" && now - s.since >= s.dur) { s.mode = "wait"; s.until = now + rand(WAIT); }

    if (s.mode === "pet") {
      // Stand still and turn to face the player (feet stepping); then rest a few seconds before wandering again.
      let diff = Math.atan2(live.player.x - g.position.x, live.player.z - g.position.z) - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += Math.max(-PET_TURN_RATE * dt, Math.min(PET_TURN_RATE * dt, diff));
      turning = Math.abs(diff) > 0.15;
      if (sincePet >= PET_ANIM) { s.mode = "wait"; s.until = now + PET_REST; }
    }

    g.position.y = sincePet < PET_HOP_TIME ? PET_HOP * Math.sin((Math.PI * sincePet) / PET_HOP_TIME) : 0;

    const dv = want - speed.current;
    speed.current += Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * dt);
    const x0 = g.position.x;
    const z0 = g.position.z;
    g.position.x += Math.sin(g.rotation.y) * speed.current * dt;
    g.position.z += Math.cos(g.rotation.y) * speed.current * dt;
    keepClear(g.position, RADIUS);
    const covered = dt > 0 ? Math.hypot(g.position.x - x0, g.position.z - z0) / dt : 0;
    pace.current += (covered - pace.current) * Math.min(1, 10 * dt);
    live.dog.x = g.position.x; // the minimap draws the animal from here
    live.dog.z = g.position.z;

    // Pushing against something it didn't see coming (a boulder): give up and stand.
    s.stuck = s.mode === "walk" && want > 0.5 && covered < want * 0.3 ? s.stuck + dt : 0;
    if (s.stuck > 0.8) { s.target = null; s.mode = "wait"; s.until = now + 2; }

    // Legs follow the ground actually covered, so the feet don't slide; turning on the spot steps them too.
    const walking = turning || (playing.current === WALK_CLIP ? pace.current > IDLE_BELOW : pace.current > WALK_ABOVE);
    const clip = walking ? WALK_CLIP : IDLE_CLIP;
    if (clip !== playing.current) {
      actions[playing.current ?? ""]?.fadeOut(0.3);
      actions[clip]?.reset().fadeIn(0.3).play();
      playing.current = clip;
    }
    const walkAction = actions[WALK_CLIP];
    if (walkAction) walkAction.timeScale = Math.max(0.4, Math.min(2, pace.current / STRIDE));

    // Head and neck on top of the clip: drinking eases the head down to the water and back up (also if it is petted mid-drink).
    const { neck, head } = bones.current;
    lowered.current += ((s.mode === "drink" ? 1 : 0) - lowered.current) * (1 - Math.exp(-HEAD_EASE * dt));
    if (neck && head) {
      const low = lowered.current;
      if (low > 0.001) {
        bend(g, neck, NECK_DOWN * low + 0.05 * low * Math.sin(now * 2.5));
        bend(g, head, HEAD_DOWN * low);
      }
    }

    const h = heart.current;
    if (h && heartMat.current) {
      const k = sincePet / PET_ANIM;
      h.visible = k >= 0 && k < 1;
      if (h.visible) {
        const rise = 1 - (1 - k) * (1 - k);
        h.position.set(g.position.x, g.position.y + HEAD_Y + HEART_RISE * rise, g.position.z);
        h.quaternion.copy(camera.quaternion);
        h.scale.setScalar(HEART_SIZE * (1 + 0.35 * k));
        heartMat.current.opacity = 1 - k * k * k;
      }
    }
  });

  return (
    <>
      <group
        ref={root}
        scale={SCALE}
        position={[TOWN.dog[0], 0, TOWN.dog[1]]}
        onClick={(_e: ThreeEvent<MouseEvent>) => {
          if (pressedWith.current === "touch") pet();
        }}
      >
        <primitive object={scene} />
      </group>
      <mesh ref={heart} geometry={heartGeometry} visible={false} userData={{ noHalftone: true }} renderOrder={10}>
        <meshBasicMaterial ref={heartMat} color="#f29bb0" transparent depthWrite={false} side={DoubleSide} />
      </mesh>
    </>
  );
}

useGLTF.preload(DINO_URL);
