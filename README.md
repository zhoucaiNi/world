# world

A small walkable 3D town.
Vite + React + TypeScript + three.js (@react-three/fiber, drei). No API keys, no backend.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # typecheck + production build to dist/

## Live SFO flight data

The scraper uses the official SFO JSON endpoint (the same source as SFO’s Flight Status page). It returns normalized arrivals/departures, airline, route, schedule, gate, baggage carousel, and status fields.

```bash
npm run flight:scrape -- --direction=arrival --limit=25
npm run flight:scrape -- --airline=United
npm run flight:test
```

SFO’s endpoint covers flights 12 hours ahead and 4 hours past and reports times in Pacific Time. Always verify a flight with the airline before traveling.

## Edit
- `src/town.ts`: the town layout (houses and their wall colours, props, lanterns, paths, campfire, windmill, trees) and the
  collisions derived from it. The scene, the dog and the minimap all read it.
- `src/buildings.ts`: how houses and the windmill are assembled from kit pieces.
- `src/World.tsx`: ground, materials, lighting; renders what `town.ts` describes.
- `src/Minimap.tsx`: the round map in the corner.
- `CREDITS.md`: asset credits (not shown in the app).
- `src/Player.tsx`: shiba, click-to-walk + WASD/arrows, collisions, follow camera.
- `src/App.tsx`: loading veil, HUD, sound mixer.

## Next
- Swap primitive meshes for Blender `.glb` (Draco/Meshopt) and KTX2 textures; then drive the veil from drei `useProgress`.
- Chunk-split three (bundle is ~1 MB / 311 kB gzip).
- Deploy as a static site on its own subdomain.
