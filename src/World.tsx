import { lazy, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Color, Fog, Matrix4, MeshStandardMaterial, PlaneGeometry,
  type DirectionalLight, type Group, type HemisphereLight, type InstancedMesh, type Material, type PointLight,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import Player, { type SeatPrompt } from "./Player";
import Sky, { LightShafts, Mist, fogColourAt } from "./Sky";
import { WORLD } from "./worldConfig";
// One animal per world, loaded on demand: the shiba in the town, the stegosaurus in the park. They share no code.
const Animal = lazy(() => (WORLD.id === "jurassic" ? import("./Dino") : import("./Shiba")));
import Campfire from "./Campfire";
import { FountainJet, waterMaterial } from "./Fountain";
import Fireflies from "./Fireflies";
import Radio from "./Radio";
import Birds from "./Birds";
import { Grass, grassMaterial } from "./Grass";
import { Bushes, Flowers, bushMaterial, flowerMaterial } from "./Flora";
import { JurassicLawn, JurassicTrees, PondRim } from "./Prehistoric";
import { Pond, WildGround } from "./Wild";
import {
  Batch, PROP_SWATCHES, Piece, ROOF_SWATCH, jurassicSwap, kitSwatchMask, nature, recolorKit, town, trs,
  type Placement, type Swap, type Swatch,
} from "./Kit";
import { SAILS_AT, WINDMILL_PARTS, houseParts, type Part } from "./buildings";
import {
  FACING, ISLAND_RADIUS, MODULE, PROPS, TOWN, TREES, blocked, inPond, onLane, onPath, seeded,
  type House, type RoofTone, type Vec2,
} from "./town";
import { currentHour, mixPair, night, nightAt, palette, syncUiTheme } from "./theme";

// One material per role, created once and recoloured in place as the time changes,
// so the halftone patch (applied once at mount) stays on them.
function useMaterials() {
  // The town kit colours everything from one palette texture; clone its material per role
  // and tint with `color` (which multiplies the texture).
  const kit = useGLTF(town("wall")).materials.colormap as MeshStandardMaterial;
  return useMemo(() => {
    const flat = () => new MeshStandardMaterial({ flatShading: true });
    const leaf = flat();
    const recolored = (extra?: Swatch[]) => (kit.map ? recolorKit(kit.map, extra) : null);
    const withMap = (map: ReturnType<typeof recolored>) => {
      const c = kit.clone();
      c.map = map;
      c.metalness = 0;
      c.roughness = 1;
      return c;
    };
    const wallMap = recolored();
    const roof: Record<RoofTone, MeshStandardMaterial> = {
      terracotta: withMap(recolored(ROOF_SWATCH.terracotta)),
      sage: withMap(recolored(ROOF_SWATCH.sage)),
    };
    return {
      houses: TOWN.houses.map(() => withMap(wallMap)),
      roof,
      prop: withMap(recolored(PROP_SWATCHES)),
      // Lantern: only its glass swatch glows (emissive mask over the colormap).
      lantern: Object.assign(withMap(wallMap), {
        emissive: new Color("#ffcf7a"),
        emissiveMap: kit.map ? kitSwatchMask(kit.map, 2, 2) : null,
      }),
      window: new MeshStandardMaterial({ emissive: "#ffcf7a" }),
      leaf,
      trunk: flat(),
      lawn: new MeshStandardMaterial({ flatShading: true }),
      grass: grassMaterial(),
      bush: bushMaterial(),
      flowerYellow: flowerMaterial(leaf.color),
      flowerPurple: flowerMaterial(leaf.color),
      stone: flat(),
      wood: flat(),
      orange: flat(),
      red: flat(),
      tan: flat(),
      cream: flat(),
      ground: new MeshStandardMaterial({ flatShading: true }),
      path: new MeshStandardMaterial({ flatShading: true }),
      water: waterMaterial(),
    };
  }, [kit]);
}
type Materials = ReturnType<typeof useMaterials>;

type PartMaterials = Record<"walls" | "roof" | "prop", Material>;

/** Rendered inside a group scaled by MODULE. */
function Parts({ parts, materials, glow }: { parts: Part[]; materials: PartMaterials; glow: Material }) {
  const items = useMemo(
    () => parts.flatMap((p): Placement[] =>
      p.kind === "piece" ? [{ url: town(p.name), swap: () => materials[p.material], matrix: trs(...p.position, p.rotation) }] : [],
    ),
    [parts, materials],
  );
  // All the window glass of one building as a single mesh.
  const glass = useMemo(() => {
    const planes = parts.flatMap((p) =>
      p.kind === "glow" ? [new PlaneGeometry(...p.size).applyMatrix4(trs(...p.position, p.rotation))] : [],
    );
    return planes.length ? mergeGeometries(planes) : null;
  }, [parts]);
  useEffect(() => () => glass?.dispose(), [glass]);
  return (
    <>
      <Batch items={items} />
      {glass && <mesh geometry={glass} material={glow} userData={{ noHalftone: true }} />}
    </>
  );
}

function Building({ h, wallMaterial, m }: { h: House; wallMaterial: Material; m: Materials }) {
  const parts = useMemo(() => houseParts(h), [h]);
  const materials = useMemo(() => ({ walls: wallMaterial, roof: m.roof[h.roof], prop: m.prop }), [wallMaterial, m, h.roof]);
  return (
    <group position={[h.at[0], 0, h.at[1]]} rotation={[0, FACING[h.facing].yaw, 0]}>
      <group scale={MODULE}>
        <Parts parts={parts} materials={materials} glow={m.window} />
      </group>
    </group>
  );
}

function Windmill({ m }: { m: Materials }) {
  const { at, facing } = TOWN.windmill!;
  const sails = useRef<Group>(null);
  const materials = useMemo(() => ({ walls: m.roof.terracotta, roof: m.roof.terracotta, prop: m.prop }), [m]);
  const swap = useMemo(() => (): Material => m.roof.terracotta, [m]);
  useFrame((_, dt) => {
    if (sails.current) sails.current.rotation.x += Math.min(dt, 0.05) * 0.35;
  });
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, FACING[facing].yaw, 0]}>
      <group scale={MODULE}>
        <Parts parts={WINDMILL_PARTS} materials={materials} glow={m.window} />
        {/* The sails' axle is the model's x axis; turn it to point out of the front. */}
        <group position={SAILS_AT} rotation={[0, -Math.PI / 2, 0]}>
          <group ref={sails}>
            <Piece url={town("windmill")} swap={swap} />
          </group>
        </group>
      </group>
    </group>
  );
}

function Props({ swaps }: { swaps: Record<"town" | "nature", Swap> }) {
  const items = useMemo(
    () => TOWN.props.map((p): Placement => {
      const def = PROPS[p.kind];
      const [ox, oz] = def.offset ?? [0, 0];
      const matrix = trs(p.at[0], p.y ?? 0, p.at[1], p.rot ?? 0).multiply(trs(-ox * def.scale, 0, -oz * def.scale, def.yaw ?? 0, def.scale));
      if (def.stretch) matrix.multiply(new Matrix4().makeScale(1, def.stretch, 1));
      return { url: def.url, swap: def.kit === "jurassic" ? jurassicSwap : swaps[def.kit], matrix };
    }),
    [swaps],
  );
  return <Batch items={items} />;
}

const TILE = MODULE * 0.97; // a hairline of lawn between slabs reads as paving

function Paving({ material }: { material: Material }) {
  const cells = useMemo(
    () =>
      TOWN.paths.flatMap(({ from, to }) => {
        const out: Vec2[] = [];
        for (let x = from[0] + MODULE / 2; x < to[0]; x += MODULE) {
          for (let z = from[1] + MODULE / 2; z < to[1]; z += MODULE) out.push([x, z]);
        }
        return out;
      }),
    [],
  );
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const mat = new Matrix4();
    cells.forEach(([x, z], k) => im.setMatrixAt(k, mat.makeTranslation(x, 0.03, z)));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[undefined, material, cells.length]} receiveShadow userData={{ noHalftone: true }}>
      <boxGeometry args={[TILE, 0.06, TILE]} />
    </instancedMesh>
  );
}

function Trees({ swap }: { swap: Swap }) {
  if (WORLD.flora) return <JurassicTrees />;
  const items = useMemo(
    () => TREES.map(({ at, type, scale, turn }): Placement => ({ url: nature(type), swap, matrix: trs(at[0], 0, at[1], turn, scale) })),
    [swap],
  );
  return <Batch items={items} />;
}

type Spot = [number, number, number, number];
// In the park, low plants (`soft`) also creep onto the worn earth, thinly, but keep off the pond and the lane.
function spots(seed: number, count: number, minScale: number, maxScale: number, pathPad = 0.2, blockPad = 0.6, soft = false): Spot[] {
  const rnd = seeded(seed);
  const out: Spot[] = [];
  while (out.length < count) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (ISLAND_RADIUS + 1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const turn = rnd() * Math.PI * 2;
    const scale = minScale + rnd() * (maxScale - minScale);
    if (WORLD.flora) {
      if (inPond(x, z, 0.9) || onLane(x, z, 0.5) || blocked(x, z, blockPad)) continue;
      if (onPath(x, z, pathPad) && !(soft && rnd() < 0.2)) continue;
      out.push([x, z, turn, scale]);
    } else if (!onPath(x, z, pathPad) && !blocked(x, z, blockPad)) out.push([x, z, turn, scale]);
  }
  return out;
}

/** Grass clumps, bushes and a few flowers across the lawn (instanced, no halftone). */
function Lawn({ grass, bush, yellow, purple }: Record<"grass" | "bush" | "yellow" | "purple", MeshStandardMaterial>) {
  const fl = WORLD.flora;
  const prehistoric = useMemo(() => fl && {
    ferns: spots(11, fl.ferns, 1.9, 3.0, 0.2, 0.6, true),
    fernModels: spots(17, fl.fernModels, 0.8, 1.6, 0.5, 0.9, true),
    cycads: spots(37, fl.cycads, 0.8, 1.3, 0.9, 1.2),
    treeFerns: spots(41, fl.treeFerns, 0.8, 1.3, 0.9, 1.2),
    horsetails: spots(53, fl.horsetails, 0.8, 1.4, 0.4, 0.8, true),
    boulders: spots(61, fl.boulders, 0.5, 1.3, 1.0, 1.4),
  }, [fl]);
  const layout = useMemo(() => ({
    grass: spots(11, 1400, 1.0, 1.7),
    bush: spots(37, 50, 1.6, 2.4),
    yellow: spots(41, 60, 1.6, 2.2),
    purple: spots(53, 60, 1.6, 2.2),
  }), []);
  if (prehistoric) return <JurassicLawn layout={prehistoric} />;
  return (
    <>
      <Grass spots={layout.grass} material={grass} />
      <Bushes spots={layout.bush} material={bush} />
      <Flowers spots={layout.yellow} material={yellow} />
      <Flowers spots={layout.purple} material={purple} />
    </>
  );
}

const LANTERN_SCALE = 1.6; // kit lantern is 1.56 tall -> about 2.5
const LANTERN_GLASS = 1.4 * LANTERN_SCALE; // height of the glass head, where the light sits

function LampPosts({ m, lights }: { m: Materials; lights: MutableRefObject<(PointLight | null)[]> }) {
  const items = useMemo(
    () => TOWN.lanterns.map(([x, z]): Placement => ({ url: town("lantern"), swap: () => m.lantern, matrix: trs(x, 0, z, 0, LANTERN_SCALE) })),
    [m],
  );
  return (
    <>
      <Batch items={items} />
      {TOWN.lanterns.map(([x, z], i) => (
        <pointLight key={i} ref={(l) => { lights.current[i] = l; }} position={[x, LANTERN_GLASS, z]} distance={9} color="#ffcf8a" />
      ))}
    </>
  );
}

const A = WORLD.atmosphere;
const [DAY_SUN, NIGHT_MOON] = A.sunPos;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const NIGHT_MUL = new Color("#7682ad");

export default function World({ onSeat }: { onSeat: (s: SeatPrompt) => void }) {
  const m = useMaterials();
  const scene = useThree((s) => s.scene);

  // Nature-kit models keep their shapes but take our theme-driven materials, by material name.
  const natureSwap = useMemo<Swap>(() => {
    const byName: Record<string, Material> = {
      leafsGreen: m.leaf, leafsDark: m.leaf, woodBark: m.trunk, woodBarkDark: m.trunk, woodInner: m.wood,
      grass: m.leaf, stone: m.stone, wood: m.wood, woodDark: m.wood,
      leafsFall: m.orange, dirt: m.wood, colorRed: m.red, colorTan: m.tan, _defaultMat: m.cream,
    };
    return (orig) => byName[orig.name] ?? orig;
  }, [m]);
  const swaps = useMemo(() => ({
    town: (orig: Material) => (orig.name === "Water" ? m.water : m.prop),
    nature: natureSwap,
  }), [m, natureSwap]);
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const lamps = useRef<(PointLight | null)[]>([]);

  const fixed = useMemo(() => ({
    houseTint: TOWN.houses.map((h) => new Color("#ffffff").lerp(new Color(h.color), 0.95)),
    nightMul: new Color(),
    sky: new Color(),
    fog: new Fog("#000", A.fog.near, A.fog.far),
  }), []);

  // Recolour every frame (a few dozen colour copies): lights and materials that mount after the
  // first frame, such as when a late model load remounts part of the scene, must still pick up the blend.
  useFrame(() => {
    const t = nightAt(currentHour());
    night.value = t;
    syncUiTheme(t);

    mixPair(palette.sky, t, fixed.sky);
    scene.background = fixed.sky;
    fogColourAt(t, fixed.fog.color);
    scene.fog = fixed.fog;

    // Kit materials multiply their texture: tint walls toward each house's pastel, darken bluish at night.
    fixed.nightMul.set("#ffffff").lerp(NIGHT_MUL, t);
    m.houses.forEach((mat, i) => mat.color.copy(fixed.houseTint[i]).multiply(fixed.nightMul));
    m.roof.terracotta.color.copy(fixed.nightMul);
    m.roof.sage.color.copy(fixed.nightMul);
    m.prop.color.copy(fixed.nightMul);
    mixPair(palette.leaf, t, m.leaf.color);
    mixPair(palette.trunk, t, m.trunk.color);
    mixPair(palette.lawn, t, m.lawn.color);
    mixPair(palette.lawn, t, m.grass.color);
    mixPair(palette.lawn, t, m.bush.color).multiplyScalar(0.8);
    mixPair(palette.flowerYellow, t, m.flowerYellow.color);
    mixPair(palette.flowerPurple, t, m.flowerPurple.color);
    mixPair(palette.stone, t, m.stone.color);
    mixPair(palette.wood, t, m.wood.color);
    mixPair(palette.orange, t, m.orange.color);
    mixPair(palette.red, t, m.red.color);
    mixPair(palette.tan, t, m.tan.color);
    mixPair(palette.cream, t, m.cream.color);
    mixPair(palette.path, t, m.path.color);
    mixPair(palette.water, t, m.water.color);
    m.lantern.color.copy(fixed.nightMul);
    mixPair(palette.ground, t, m.ground.color);
    mixPair(["#fffaf4", "#ffcf7a"], t, m.window.color);
    m.window.emissiveIntensity = t * 1.4;
    m.lantern.emissiveIntensity = t * 2.2;

    if (hemi.current) {
      mixPair(palette.hemiSky, t, hemi.current.color);
      mixPair(palette.hemiGround, t, hemi.current.groundColor);
      hemi.current.intensity = lerp(A.hemi[0], A.hemi[1], t);
    }
    if (sun.current) {
      mixPair(palette.sun, t, sun.current.color);
      sun.current.intensity = lerp(A.sun[0], A.sun[1], t);
      sun.current.position.set(
        lerp(DAY_SUN[0], NIGHT_MOON[0], t), lerp(DAY_SUN[1], NIGHT_MOON[1], t), lerp(DAY_SUN[2], NIGHT_MOON[2], t),
      );
    }
    lamps.current.forEach((l) => { if (l) l.intensity = t * 30; });
  });

  return (
    <>
      <Sky />
      {A.mist > 0 && <Mist />}
      {A.shafts > 0 && <LightShafts />}
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-ISLAND_RADIUS - 2}
        shadow-camera-right={ISLAND_RADIUS + 2}
        shadow-camera-top={ISLAND_RADIUS + 2}
        shadow-camera-bottom={-ISLAND_RADIUS - 2}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="ground" material={m.ground}>
        <circleGeometry args={[ISLAND_RADIUS + 2, 56]} />
      </mesh>

      {TOWN.houses.map((h, i) => (
        <Building key={i} h={h} wallMaterial={m.houses[i]} m={m} />
      ))}
      {TOWN.windmill && <Windmill m={m} />}
      {TOWN.pond ? <WildGround /> : <Paving material={m.path} />}
      {TOWN.pond && <Pond />}
      {TOWN.pond && <PondRim />}
      <Props swaps={swaps} />
      <Radio />
      <Trees swap={natureSwap} />
      <Lawn grass={m.grass} bush={m.bush} yellow={m.flowerYellow} purple={m.flowerPurple} />
      <Fireflies />
      <Birds />
      <Campfire swap={natureSwap} />
      {!TOWN.pond && <FountainJet />}
      <LampPosts m={m} lights={lamps} />
      <Animal />
      <Player onSeat={onSeat} />
    </>
  );
}
