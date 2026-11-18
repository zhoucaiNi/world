# world

A small walkable 3D town as a portfolio. Each building is a project.
Vite + React + TypeScript + three.js (@react-three/fiber, drei). No API keys, no backend.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # typecheck + production build to dist/

## Edit
- `src/projects.ts`: one entry = one project (title, blurb, url, colour).
- `src/town.ts`: the town layout (houses, props, lanterns, paths, campfire, windmill, trees) and the
  collisions derived from it. The scene, the dog and the minimap all read it.
- `src/buildings.ts`: how houses and the windmill are assembled from kit pieces.
- `src/World.tsx`: ground, materials, lighting; renders what `town.ts` describes.
- `src/Minimap.tsx`: the round map in the corner.
- `CREDITS.md`: asset credits; the List view renders it (`src/credits.ts`).
- `src/Player.tsx`: shiba, click-to-walk + WASD/arrows, collisions, follow camera.
- `src/App.tsx`: loading veil, project panel, "List view" HTML fallback.

## Next
- Swap primitive meshes for Blender `.glb` (Draco/Meshopt) and KTX2 textures; then drive the veil from drei `useProgress`.
- Chunk-split three (bundle is ~1 MB / 311 kB gzip).
- Deploy as a static site on its own subdomain.
- Plan: Obsidian `30 Build/3D Portfolio/3D Portfolio Setup Plan`.
