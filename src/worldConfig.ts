// Which world to show, chosen once at load: `?world=jurassic`, otherwise the town (the default).
// Everything that differs between the two worlds lives here; the layout in town.ts is shared.

type Pair = readonly [string, string]; // [day, night] colour, like `palette` in theme.ts
type Swap = readonly (readonly [readonly number[], number])[]; // atlas colour -> palette tone index (see Birds.tsx)

export type WorldConfig = {
  id: "town" | "jurassic";
  title: string; // document.title
  birds: readonly { url: string; length: number; yaw: number; swap: Swap }[]; // length: metres nose to tail; empty swap = one flat tone
  sounds: Record<"musicDay" | "musicNight" | "guitar" | "fire" | "fountain" | "crickets" | "birds", string>;
  palette: Record<string, Pair>; // overrides, same keys as `palette` in theme.ts
  atmosphere: {
    fog: { near: number; far: number; tint: string | null; tintAmount: number }; // fog = sky colour pulled toward `tint` (day only) by tintAmount
    hemi: readonly [number, number]; // hemisphere intensity [day, night]
    sun: readonly [number, number]; // directional intensity [day, night]
    sunPos: readonly [readonly [number, number, number], readonly [number, number, number]]; // [day sun, night moon]
    mist: number; // peak opacity of the low ground-mist quads; 0 = none
    shafts: number; // peak opacity of the day-only light shafts; 0 = none
    fireflies: {
      count: number;
      size: number; // point size multiplier
      wander: number; // drift range multiplier
      colors: readonly [readonly [number, number, number], readonly [number, number, number]]; // linear rgb of the two kinds
      share: readonly [number, number, number]; // cumulative pick thresholds: near trees, near the campfire, near the fountain water; the rest scatter
    };
    sky: { haze: string | null; mountains: boolean }; // haze: warm glow colour round the sun by day
  };
  // Plants. null = the town's grass, bushes and flowers; set = the Jurassic layers in Prehistoric.tsx (no flowers, no grass).
  flora: null | {
    ferns: number; // low procedural fern clumps (replace grass)
    fernModels: number; // fern models, scattered the same way
    cycads: number;
    treeFerns: number;
    horsetails: number;
    boulders: number; // moss-tinted rocks
    treeScale: number; // conifer scale relative to the town tree at the same spot
    broadShare: number; // share of conifers that are the broad kind; the rest are tall and narrow
  };
  affectionCookie: string;
  text: {
    intro: string; // about-dialog opening line
    dogAbout: string; // sentence after "Pet the dog"
    affectionTitle: string;
    affectionAria: string; // prefix of the aria-label
    birdsLabel: string; // volume slider label
    waterLabel: string; // volume slider label for the fountain / watering hole
    mapLabel: string; // aria-label of the minimap
  };
};

const town: WorldConfig = {
  id: "town",
  title: "Zhoucai's World",
  birds: [
    { url: "/models/birds/jay.glb", length: 0.32, yaw: -Math.PI / 2, // modelled facing +x
      swap: [[[79, 168, 0], 0], [[60, 131, 168], 1], [[181, 111, 49], 2], [[25, 25, 25], 3], [[57, 57, 57], 3], [[200, 200, 200], 4]] },
    { url: "/models/birds/sparrow.glb", length: 0.34, yaw: 0,
      swap: [[[197, 118, 52], 5], [[196, 185, 165], 4], [[98, 64, 36], 6], [[9, 8, 4], 3]] },
  ],
  sounds: {
    musicDay: "/sounds/music-day.m4a", musicNight: "/sounds/music-night.m4a", guitar: "/sounds/guitar.m4a", fire: "/sounds/fire.m4a",
    fountain: "/sounds/fountain.m4a", crickets: "/sounds/crickets.m4a", birds: "/sounds/birds.m4a",
  },
  palette: {},
  atmosphere: {
    fog: { near: 28, far: 60, tint: null, tintAmount: 0 },
    hemi: [0.9, 2.6],
    sun: [1.6, 1.0],
    sunPos: [[10, 16, 6], [-8, 16, 6]],
    mist: 0,
    shafts: 0,
    fireflies: { count: 140, size: 1, wander: 1, colors: [[0.91, 1.0, 0.6], [1.0, 0.89, 0.54]], share: [0.4, 0.65, 0.65] },
    sky: { haze: null, mountains: false },
  },
  flora: null,
  affectionCookie: "world-dog",
  text: {
    intro: "A tiny town you can wander around. It's still being built, so things will keep changing.",
    dogAbout: "A shiba wanders the town.",
    affectionTitle: "The shiba's affection for you. Pet it once a day; it loses 1 for each day you skip.",
    affectionAria: "Shiba affection",
    birdsLabel: "Birds",
    waterLabel: "Fountain",
    mapLabel: "Town map",
  },
};

const jurassic: WorldConfig = {
  id: "jurassic",
  title: "Zhoucai's Jurassic World",
  birds: [
    // One pterosaur model; empty swap = a single flat tone (palette.birdSage).
    { url: "/models/jurassic/pterosaur.glb", length: 0.9, yaw: 0, swap: [] },
  ],
  sounds: {
    musicDay: "/sounds/jurassic/music-day.m4a", musicNight: "/sounds/jurassic/music-night.m4a", guitar: "/sounds/jurassic/guitar.m4a",
    fire: "/sounds/jurassic/fire.m4a", fountain: "/sounds/jurassic/fountain.m4a", crickets: "/sounds/jurassic/crickets.m4a",
    birds: "/sounds/jurassic/birds.m4a",
  },
  palette: {
    sky: ["#f1dfae", "#14231f"],
    skyTop: ["#8fc9b4", "#06120f"],
    ground: ["#7fa46a", "#1f3a2c"],
    leaf: ["#4f8f4a", "#173a26"],
    trunk: ["#7a5a3c", "#2e2118"],
    hemiSky: ["#fff0c8", "#5a8a78"],
    hemiGround: ["#6d7f4e", "#24433a"],
    sun: ["#ffe9b0", "#ffb35c"],
    lawn: ["#86b06a", "#233f2e"],
    water: ["#7cc4b0", "#245448"],
    birdSage: ["#7d9a62", "#26382c"],
  },
  atmosphere: {
    // Dense, humid air: fog closes in early and takes a warm green-gold tint by day. Hemisphere stays high so shadows are never black.
    fog: { near: 9, far: 46, tint: "#d9d9a0", tintAmount: 0.45 },
    hemi: [1.25, 2.4],
    sun: [1.5, 0.9],
    sunPos: [[14, 11, 7], [-8, 16, 6]],
    mist: 0.5,
    shafts: 0.1,
    fireflies: { count: 260, size: 1.25, wander: 1.5, colors: [[1.0, 0.62, 0.15], [0.3, 1.0, 0.75]], share: [0.3, 0.4, 0.62] },
    sky: { haze: "#ffd89a", mountains: true },
  },
  flora: { ferns: 950, fernModels: 280, cycads: 75, treeFerns: 65, horsetails: 80, boulders: 32, treeScale: 0.7, broadShare: 0.2 },
  affectionCookie: "world-dino",
  text: {
    intro: "A patch of Jurassic wilderness you can wander: ferns, conifers and a watering hole. It's still being built, so things will keep changing.",
    dogAbout: "A dinosaur roams the wild.",
    affectionTitle: "The dinosaur's trust in you. Pet it once a day; it loses 1 for each day you skip.",
    affectionAria: "Dinosaur affection",
    birdsLabel: "Calls",
    waterLabel: "Watering hole",
    mapLabel: "Park map",
  },
};

export const WORLD: WorldConfig = new URLSearchParams(location.search).get("world") === "jurassic" ? jurassic : town;
document.title = WORLD.title;
