// `&debug` in the URL turns on developer controls. For now: in the Jurassic world, a "Go drink" button (and the G key) sends the
// animal straight to the watering hole so its drinking can be watched on demand.
export const DEBUG = new URLSearchParams(location.search).has("debug");

/** Filled in by the component it controls (Dino.tsx), so the UI can call it without importing the component. */
export const debugActions = { drink: () => {} };
