# world

A small walkable 3D town.
Vite + React + TypeScript + three.js (@react-three/fiber, drei). No API keys, no backend.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # typecheck + production build to dist/

Two worlds share one layout: the town (default) and a Jurassic park, `?world=jurassic`. Add `&debug` for developer controls: in the
Jurassic world a "Go drink · G" button sends the stegosaurus to the pond.

## Edit
- `src/town.ts`: the town layout (houses and their wall colours, props, lanterns, paths, campfire, windmill, trees) and the
  collisions derived from it. The scene, the dog and the minimap all read it.
- `src/buildings.ts`: how houses and the windmill are assembled from kit pieces.
- `src/World.tsx`: ground, materials, lighting; renders what `town.ts` describes.
- `src/Minimap.tsx`: the round map in the corner.
- `CREDITS.md`: asset credits (not shown in the app).
- `src/Player.tsx`: shiba, click-to-walk + WASD/arrows, collisions, follow camera.
- `src/worldConfig.ts`: what differs between the two worlds (fog and light, palette, sounds, birds, plants, text).
- `src/Shiba.tsx` (town) and `src/Dino.tsx` (Jurassic): the roaming animal. They share no code.
- `src/Prehistoric.tsx`, `src/Wild.tsx`, `src/lod.ts`, `src/jurassicStyle.ts`: the Jurassic plants (with distance levels of detail),
  the earth and pond, and the flat look applied to its models.
- `src/App.tsx`: loading veil, HUD, sound mixer.

## Next
- Swap primitive meshes for Blender `.glb` (Draco/Meshopt) and KTX2 textures; then drive the veil from drei `useProgress`.
- Chunk-split three (bundle is ~1 MB / 311 kB gzip).
- Deploy as a static site on its own subdomain.
