import type { House, RoofTone, Vec2 } from "./town";

// Parts are in module units of the building's own frame: x right, z toward the front, y up one unit per floor.

type V3 = [number, number, number];
export type Part =
  | { kind: "piece"; name: string; material: "walls" | "roof" | "prop"; position: V3; rotation: number }
  | { kind: "glow"; size: [w: number, h: number]; position: V3; rotation: number };

type Side = "front" | "back" | "left" | "right";
// Each side's outward normal, and the yaw that turns +z to it.
const SIDES: Record<Side, { n: Vec2; yaw: number }> = {
  front: { n: [0, 1], yaw: 0 },
  back: { n: [0, -1], yaw: Math.PI },
  left: { n: [-1, 0], yaw: -Math.PI / 2 },
  right: { n: [1, 0], yaw: Math.PI / 2 },
};

// Kit wall pieces stand on their cell's +x edge with the decorated face (shutters, banner hooks)
// toward -x. Turning a piece by the side's yaw + 90° points that face outward; sliding it this far
// along the normal puts it back on the cell's edge.
const OUT = 0.9;

// Window openings in each wall piece (width, height), centred half a floor up, measured from the GLBs.
const OPENING: Record<string, [w: number, h: number]> = {
  "wall-window-glass": [0.4, 0.6],
  "wall-window-shutters": [0.42, 0.5],
  "wall-window-small": [0.22, 0.5],
  "wall-wood-window-glass": [0.4, 0.6],
  "wall-wood-window-shutters": [0.4, 0.5],
};

function wall(name: string, [x, z]: Vec2, side: Side, floor: number, material: "walls" | "roof" | "prop" = "walls"): Part[] {
  const { n, yaw } = SIDES[side];
  const piece: Part = { kind: "piece", name, material, position: [x + n[0] * OUT, floor, z + n[1] * OUT], rotation: yaw + Math.PI / 2 };
  const hole = OPENING[name];
  if (!hole) return [piece];
  return [piece, { kind: "glow", size: hole, position: [x + n[0] * 0.43, floor + 0.5, z + n[1] * 0.43], rotation: yaw }];
}

// Per floor: plaster downstairs, timber upstairs. Patterns repeat along each side; `middle` is the
// front's middle cell (the door downstairs, a plain wall for the banner upstairs).
const FACADE = [
  { front: ["wall-window-glass"], middle: "wall-door", back: ["wall", "wall-window-small"], side: ["wall-window-shutters", "wall"] },
  { front: ["wall-wood-window-glass"], middle: "wall-wood", back: ["wall-wood-window-shutters", "wall-wood"], side: ["wall-wood", "wall-wood-window-shutters"] },
];

// A banner in the other roof's colour hangs above the door.
const BANNER: Record<RoofTone, string> = { terracotta: "banner-green", sage: "banner-red" };

const pick = (list: string[], i: number) => list[i % list.length];

export function houseParts(h: House): Part[] {
  const x = (i: number) => i - (h.width - 1) / 2; // column i across the front
  const z = (j: number) => (h.depth - 1) / 2 - j; // row j from the front back
  const mid = Math.floor((h.width - 1) / 2);
  const columns = Array.from({ length: h.width }, (_, i) => i);
  const rows = Array.from({ length: h.depth }, (_, j) => j);
  return [
    ...FACADE.slice(0, h.floors).flatMap((f, floor) => [
      ...columns.flatMap((i) => wall(i === mid ? f.middle : pick(f.front, i), [x(i), z(0)], "front", floor)),
      ...columns.flatMap((i) => wall(pick(f.back, i), [x(i), z(h.depth - 1)], "back", floor)),
      ...rows.flatMap((j) => wall(pick(f.side, j), [x(0), z(j)], "left", floor)),
      ...rows.flatMap((j) => wall(pick(f.side, j), [x(h.width - 1), z(j)], "right", floor)),
    ]),
    // Gable roof: each kit roof piece is a solid wedge (eave at its -x, ridge at +x, plaster gable
    // ends) that sits right on the top floor. The front row turns its eave to +z, the back row to -z.
    ...columns.flatMap((i): Part[] => [
      { kind: "piece", name: "roof", material: "roof", position: [x(i), h.floors, z(0)], rotation: Math.PI / 2 },
      { kind: "piece", name: "roof", material: "roof", position: [x(i), h.floors, z(1)], rotation: -Math.PI / 2 },
    ]),
    { kind: "piece", name: "chimney", material: "roof", position: [x(h.width - 1), h.floors, z(1)], rotation: 0 },
    ...wall(BANNER[h.roof], [x(mid), z(0)], "front", h.floors - 1, "prop"),
  ];
}

// The sails are separate because they turn.
const TOWER = [
  { front: "wall-door", other: "wall-window-small" },
  { front: "wall-wood-window-glass", other: "wall-wood-window-shutters" },
  { front: "wall-wood", other: "wall-wood" },
];
export const WINDMILL_PARTS: Part[] = [
  ...TOWER.flatMap((f, floor) =>
    (Object.keys(SIDES) as Side[]).flatMap((side) => wall(side === "front" ? f.front : f.other, [0, 0], side, floor)),
  ),
  { kind: "piece", name: "roof-point", material: "roof", position: [0, TOWER.length, 0], rotation: 0 },
];
// High enough that the sail tips clear head height (2.2 m).
export const SAILS_AT: V3 = [0, TOWER.length - 0.25, 0.78];
