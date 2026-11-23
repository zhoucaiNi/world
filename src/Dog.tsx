import { useEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Shape, ShapeGeometry, Vector3, type Group } from "three";
import { TOWN, blocked, keepClear, live } from "./town";
import { mixPair, night, palette } from "./theme";
import { setAim } from "./aim";
import { petDog } from "./affection";

// "Shiba Inu" by Quaternius (CC0), https://poly.pizza/m/y4wdQpg767
const SHIBA_URL = "/models/shiba.glb";
const SHIBA_SCALE = 0.4; // model is ~4.2 units nose to tail
const SPEED = 1.6; // matches the Walk clip's stride at timeScale 1
const ACCEL = 2.5; // m/s², so it eases into a walk and settles to a stop
const TURN_RATE = 2.2; // rad/s, an unhurried turn
const ROAM = 18; // wanders within this radius of the town centre
const RADIUS = 0.6;
const WALK_ABOVE = 0.25; // m/s actually covered before the legs start walking
const IDLE_BELOW = 0.1; // and below which they stop, so it doesn't flicker between clips

const PET_RANGE = 3; // m from the camera
const PET_CONE = (12 * Math.PI) / 180; // how far off the crosshair the dog may be
const PET_TOUCH_CONE = (35 * Math.PI) / 180; // a tap is exact, so "Tap to pet" only needs the dog roughly in view
const PET_COOLDOWN = 0.8;
const PET_PROMPT_QUIET = 1.5; // s after a pet before the prompt returns
const PET_TURN_RATE = 6; // rad/s, quicker than wandering: it is answering you
const PET_HOP = 0.15;
const PET_HOP_TIME = 0.35;
const PET_ANIM = 1.2; // heart life, and how long it holds still
const PET_REST = 3; // stands there this long after the animation
const HEAD_Y = 1.1; // m, about the top of the head
const HEART_RISE = 0.6;
const HEART_SIZE = 0.2;
const NIGHT_GLOW = 0.3; // fraction of the fur colour it keeps at night, so unlit undersides don't go black

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

/** A random spot in town it can walk straight to, not inside or right against anything solid. */
function pickSpot(from: Vector3): Vector3 | null {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * ROAM;
    const v = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (v.distanceTo(from) > 3 && !blocked(v.x, v.z, RADIUS + 1) && clearLine(from, v)) return v;
  }
  return null;
}

/** The shiba roams on its own: walk to a random spot, idle a few seconds, repeat. */
export default function Dog() {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(SHIBA_URL);
  const { actions } = useAnimations(animations, root);
  const playing = useRef<string | null>(null);
  const target = useRef<Vector3 | null>(null);
  const waitUntil = useRef(1.5);
  const speed = useRef(0); // commanded, eased toward the wanted speed
  const pace = useRef(0); // ground actually covered (m/s, smoothed): drives the legs
  const stuckFor = useRef(0);
  const petAt = useRef(-Infinity);
  const heart = useRef<Mesh>(null);
  const heartMat = useRef<MeshBasicMaterial>(null);
  const { camera, gl, clock } = useThree();

  const pet = () => {
    const now = clock.elapsedTime;
    if (now - petAt.current < PET_COOLDOWN) return;
    petAt.current = now;
    petDog();
    target.current = null;
    stuckFor.current = 0;
    waitUntil.current = now + PET_ANIM + PET_REST;
  };

  // The one test for "the shiba is within reach and in view", shared by the click and the on-screen cue.
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
      if (e.pointerType === "touch" || e.button !== 0 || document.pointerLockElement !== canvas) return;
      if (inReach(PET_CONE)) pet();
    };
    canvas.addEventListener("pointerdown", onDown);
    return () => canvas.removeEventListener("pointerdown", onDown);
  }, [gl, camera]);

  // The model ships slightly metallic and dark; flatten it and take fur colours from the theme.
  const fur = useRef<{ main: MeshStandardMaterial[]; light: MeshStandardMaterial[] }>({ main: [], light: [] });
  useEffect(() => {
    const main: MeshStandardMaterial[] = [];
    const light: MeshStandardMaterial[] = [];
    scene.traverse((o) => {
      o.castShadow = true;
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat()) {
        if (!(m instanceof MeshStandardMaterial)) continue;
        m.metalness = 0;
        m.roughness = 1;
        if (m.name === "Main") main.push(m);
        if (m.name === "Main_Light") light.push(m);
      }
    });
    fur.current = { main, light };
  }, [scene]);

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    dt = Math.min(dt, 0.05);
    const now = state.clock.elapsedTime;

    const sincePet = now - petAt.current;
    const cone = document.pointerLockElement === gl.domElement ? PET_CONE : PET_TOUCH_CONE;
    setAim(!inReach(cone) ? "off" : sincePet < PET_PROMPT_QUIET ? "petted" : "aimed");
    const petting = sincePet < PET_ANIM;

    const rest = () => {
      target.current = null;
      stuckFor.current = 0;
      waitUntil.current = now + 2 + Math.random() * 4;
    };
    if (!target.current && now >= waitUntil.current) {
      target.current = pickSpot(g.position);
      if (!target.current) waitUntil.current = now + 1;
    }

    let want = 0;
    const t = target.current;
    if (t) {
      const dir = new Vector3().subVectors(t, g.position).setY(0);
      const dist = dir.length();
      if (dist < 0.3) rest();
      else {
        // Turn toward the target at a steady rate and walk the way it's facing, so it arcs.
        let diff = Math.atan2(dir.x, dir.z) - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
        // Slower through sharp turns, and slowing down over the last metre.
        want = SPEED * (0.35 + 0.65 * Math.max(0, Math.cos(diff))) * Math.min(1, dist);
      }
    }
    if (petting) {
      let diff = Math.atan2(live.player.x - g.position.x, live.player.z - g.position.z) - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += Math.max(-PET_TURN_RATE * dt, Math.min(PET_TURN_RATE * dt, diff));
    }
    const dv = want - speed.current;
    speed.current += Math.sign(dv) * Math.min(Math.abs(dv), (petting ? 4 : 1) * ACCEL * dt);
    g.position.y = sincePet < PET_HOP_TIME ? PET_HOP * Math.sin((Math.PI * sincePet) / PET_HOP_TIME) : 0;

    const x0 = g.position.x;
    const z0 = g.position.z;
    g.position.x += Math.sin(g.rotation.y) * speed.current * dt;
    g.position.z += Math.cos(g.rotation.y) * speed.current * dt;
    keepClear(g.position, RADIUS);
    const covered = dt > 0 ? Math.hypot(g.position.x - x0, g.position.z - z0) / dt : 0;
    pace.current += (covered - pace.current) * Math.min(1, 10 * dt);
    live.dog.x = g.position.x;
    live.dog.z = g.position.z;

    // Pushing against something it didn't see coming (the campfire, the player): give up and rest.
    stuckFor.current = want > 0.5 && covered < want * 0.3 ? stuckFor.current + dt : 0;
    if (stuckFor.current > 0.8) rest();

    for (const [mats, pair] of [[fur.current.main, palette.dog], [fur.current.light, palette.dogLight]] as const) {
      for (const m of mats) {
        mixPair(pair, night.value, m.color);
        m.emissive.copy(m.color).multiplyScalar(NIGHT_GLOW * night.value);
      }
    }
    // Legs follow the ground actually covered, so the paws don't slide.
    const walking = !petting && (playing.current === "Walk" ? pace.current > IDLE_BELOW : pace.current > WALK_ABOVE);
    const clip = walking ? "Walk" : "Idle";
    if (clip !== playing.current) {
      actions[playing.current ?? ""]?.fadeOut(0.3);
      actions[clip]?.reset().fadeIn(0.3).play();
      playing.current = clip;
    }
    if (actions.Walk) actions.Walk.timeScale = Math.max(0.4, Math.min(1.2, pace.current / SPEED));

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
      <primitive
        ref={root}
        object={scene}
        scale={SHIBA_SCALE}
        position={[TOWN.dog[0], 0, TOWN.dog[1]]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if ((e.nativeEvent as PointerEvent).pointerType === "touch") pet();
        }}
      />
      <mesh ref={heart} geometry={heartGeometry} visible={false} userData={{ noHalftone: true }} renderOrder={10}>
        <meshBasicMaterial ref={heartMat} color="#f29bb0" transparent depthWrite={false} side={DoubleSide} />
      </mesh>
    </>
  );
}

useGLTF.preload(SHIBA_URL);
