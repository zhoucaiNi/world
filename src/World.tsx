import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useGLTF } from "@react-three/drei";
import {
  Color, Fog, Matrix4, MeshStandardMaterial, PlaneGeometry,
  type DirectionalLight, type Group, type HemisphereLight, type InstancedMesh, type Material, type PointLight,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import Player, { type SeatPrompt } from "./Player";
import Sky from "./Sky";
import Dog from "./Dog";
import Campfire from "./Campfire";
import { FountainJet, waterMaterial } from "./Fountain";
import Fireflies from "./Fireflies";
import Birds from "./Birds";
import { Grass, grassMaterial } from "./Grass";
import { Bushes, Flowers, bushMaterial, flowerMaterial } from "./Flora";
import {
  Batch, PROP_SWATCHES, Piece, ROOF_SWATCH, kitSwatchMask, nature, recolorKit, town, trs,
  type Placement, type Swap, type Swatch,
} from "./Kit";
import { projectById, type Project } from "./projects";
import { SAILS_AT, WINDMILL_PARTS, houseParts, type Part } from "./buildings";
import {
  FACING, ISLAND_RADIUS, MODULE, PROPS, TOWN, TREES, blocked, onPath, seeded, signLocal,
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

function Signpost({ at, title, wood }: { at: Vec2; title: string; wood: Material }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh position={[0, 1.15, 0]} material={wood} castShadow>
        <boxGeometry args={[0.12, 2.3, 0.12]} />
      </mesh>
      <mesh position={[0, 2, 0.1]} material={wood} castShadow>
        <boxGeometry args={[1.7, 0.62, 0.08]} />
      </mesh>
      <Text
        position={[0, 2, 0.145]}
        fontSize={0.19}
        maxWidth={1.5}
        color="#fff4e4"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
      >
        {title}
      </Text>
    </group>
  );
}

function Building({ h, project, wallMaterial, m }: { h: House; project: Project; wallMaterial: Material; m: Materials }) {
  const parts = useMemo(() => houseParts(h), [h]);
  const materials = useMemo(() => ({ walls: wallMaterial, roof: m.roof[h.roof], prop: m.prop }), [wallMaterial, m, h.roof]);
  return (
    <group position={[h.at[0], 0, h.at[1]]} rotation={[0, FACING[h.facing].yaw, 0]}>
      <group scale={MODULE}>
        <Parts parts={parts} materials={materials} glow={m.window} />
      </group>
      <Signpost at={signLocal(h)} title={project.title} wood={m.wood} />
    </group>
  );
}

function Windmill({ m }: { m: Materials }) {
  const { at, facing } = TOWN.windmill;
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
      const matrix = trs(p.at[0], p.y ?? 0, p.at[1], p.rot ?? 0).multiply(trs(-ox * def.scale, 0, -oz * def.scale, 0, def.scale));
      return { url: def.url, swap: swaps[def.kit], matrix };
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
  const items = useMemo(
    () => TREES.map(({ at, type, scale, turn }): Placement => ({ url: nature(type), swap, matrix: trs(at[0], 0, at[1], turn, scale) })),
    [swap],
  );
  return <Batch items={items} />;
}

type Spot = [number, number, number, number];
function spots(seed: number, count: number, minScale: number, maxScale: number): Spot[] {
  const rnd = seeded(seed);
  const out: Spot[] = [];
  while (out.length < count) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (ISLAND_RADIUS + 1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const turn = rnd() * Math.PI * 2;
    const scale = minScale + rnd() * (maxScale - minScale);
    if (!onPath(x, z, 0.2) && !blocked(x, z, 0.6)) out.push([x, z, turn, scale]);
  }
  return out;
}

/** Grass clumps, bushes and a few flowers across the lawn (instanced, no halftone). */
function Lawn({ grass, bush, yellow, purple }: Record<"grass" | "bush" | "yellow" | "purple", MeshStandardMaterial>) {
  const layout = useMemo(() => ({
    grass: spots(11, 1400, 1.0, 1.7),
    bush: spots(37, 50, 1.6, 2.4),
    yellow: spots(41, 60, 1.6, 2.2),
    purple: spots(53, 60, 1.6, 2.2),
  }), []);
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

const DAY_SUN: [number, number, number] = [10, 16, 6];
const NIGHT_MOON: [number, number, number] = [-8, 16, 6];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const NIGHT_MUL = new Color("#7682ad");

export default function World({ onNearby, onSeat }: { onNearby: (p: Project | null) => void; onSeat: (s: SeatPrompt) => void }) {
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
    houseTint: TOWN.houses.map((h) => new Color("#ffffff").lerp(new Color(projectById(h.project).color), 0.95)),
    nightMul: new Color(),
    sky: new Color(),
    fog: new Fog("#000", 28, 60),
  }), []);

  // Recolour every frame (a few dozen colour copies): lights and materials that mount after the
  // first frame, such as when a late model load remounts part of the scene, must still pick up the blend.
  useFrame(() => {
    const t = nightAt(currentHour());
    night.value = t;
    syncUiTheme(t);

    mixPair(palette.sky, t, fixed.sky);
    scene.background = fixed.sky;
    fixed.fog.color.copy(fixed.sky);
    scene.fog = fixed.fog;

    // Kit materials multiply their texture: tint walls toward each project's pastel, darken bluish at night.
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
      hemi.current.intensity = lerp(0.9, 2.6, t);
    }
    if (sun.current) {
      mixPair(palette.sun, t, sun.current.color);
      sun.current.intensity = lerp(1.6, 1.0, t);
      sun.current.position.set(
        lerp(DAY_SUN[0], NIGHT_MOON[0], t), lerp(DAY_SUN[1], NIGHT_MOON[1], t), lerp(DAY_SUN[2], NIGHT_MOON[2], t),
      );
    }
    lamps.current.forEach((l) => { if (l) l.intensity = t * 30; });
  });

  return (
    <>
      <Sky />
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
        <Building key={h.project} h={h} project={projectById(h.project)} wallMaterial={m.houses[i]} m={m} />
      ))}
      <Windmill m={m} />
      <Paving material={m.path} />
      <Props swaps={swaps} />
      <Trees swap={natureSwap} />
      <Lawn grass={m.grass} bush={m.bush} yellow={m.flowerYellow} purple={m.flowerPurple} />
      <Fireflies />
      <Birds />
      <Campfire swap={natureSwap} />
      <FountainJet />
      <LampPosts m={m} lights={lamps} />
      <Dog />
      <Player onNearby={onNearby} onSeat={onSeat} />
    </>
  );
}
