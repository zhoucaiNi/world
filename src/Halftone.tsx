import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3, type Material } from "three";
import { night } from "./theme";

// Sizes are in world units, so the dots live ON the model surface (they move,
// rotate and shrink with the model) instead of being painted on the screen.
const CELL = 0.12; // dot pitch
const NEAR = 5; // closer than this (world units from the camera): plain lit shading, no dots
const FAR = 14; // the halftone is fully on from here out
const LEVELS = 6; // dot sizes are stepped into this many bands
const ANGLE = Math.PI / 4; // dot lattice angle on the surface

// uNight is the shared theme value (0 day, 1 night), so time changes apply without recompiling.
const uniforms = { uCell: { value: CELL }, uNight: night };

// Patches a MeshStandardMaterial so its shading is drawn as halftone dots.
// Dot size follows the angle between the surface and the sun (N.L). The dot
// lattice is projected onto the model along its dominant normal axis (triplanar,
// in the mesh's own coordinates) as smooth round dots. It fades in with distance from
// the camera, so nearby surfaces in the first-person view read clean.
// `scaleMul` corrects meshes whose raw vertex units differ from their size on
// screen (skinned models scaled up by their rig, e.g. the shiba).
function patch(mat: MeshStandardMaterial, scaleMul = 1) {
  const own = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uCell = uniforms.uCell;
    shader.uniforms.uScaleMul = { value: scaleMul };
    shader.uniforms.uNight = uniforms.uNight;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uScaleMul;\nvarying vec3 vHtPos;\nvarying vec3 vHtNrm;\nvarying float vHtScale;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHtPos = position;\nvHtNrm = normal;\nvHtScale = length(modelMatrix[0].xyz) * uScaleMul;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform float uCell;\nuniform float uNight;\nvarying vec3 vHtPos;\nvarying vec3 vHtNrm;\nvarying float vHtScale;\nvoid main() {",
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `
        {
          float nl = 1.0;
          #if NUM_DIR_LIGHTS > 0
            nl = clamp(dot(normalize(normal), directionalLights[0].direction), 0.0, 1.0);
          #endif
          float shade = 1.0 - smoothstep(0.05, 0.85, nl);
          shade = floor(shade * ${LEVELS.toFixed(1)} + 0.5) / ${LEVELS.toFixed(1)};

          vec3 n = abs(normalize(vHtNrm));
          vec2 q = (n.x > n.y && n.x > n.z) ? vHtPos.yz : ((n.y > n.z) ? vHtPos.xz : vHtPos.xy);
          q *= vHtScale;
          float a = ${ANGLE.toFixed(4)};
          mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
          vec2 f = fract((R * q) / uCell) - 0.5;
          float r = length(f);
          float aa = fwidth(r);
          // Smooth round dot of the given radius; zero radius gives no speck.
          #define HT_DOT(rad) ((1.0 - smoothstep((rad) - aa, (rad) + aa, r)) * step(0.001, (rad)))

          // 0 near the camera, 1 in the distance.
          float far = smoothstep(${NEAR.toFixed(1)}, ${FAR.toFixed(1)}, length(vViewPosition));

          // Day: pastel albedo with a gentle sun-angle shade at every distance (so walls keep their
          // colour as you walk up to them); soft tone-on-tone dots fade in with distance.
          vec3 dayBase = diffuseColor.rgb * mix(0.82, 1.06, nl);
          vec3 dayCol = mix(dayBase, dayBase * 0.85, HT_DOT(shade * 0.45) * far);
          // Night: keep the real lighting (lamp pools, glow); moonlit faces get dots that are a
          // lighter print of their own lit colour, so they fade with the light instead of glowing.
          float lit = floor(smoothstep(0.1, 0.9, nl) * ${LEVELS.toFixed(1)} + 0.5) / ${LEVELS.toFixed(1)};
          vec3 nightCol = mix(outgoingLight, outgoingLight * 1.35 + vec3(0.015, 0.014, 0.01), HT_DOT(lit * 0.24) * far);

          outgoingLight = mix(dayCol, nightCol, uNight);
        }
        #include <opaque_fragment>`,
      );
    own(shader, renderer); // the material's own shader edits run after ours
  };
  mat.customProgramCacheKey = () => "halftone-object" + (mat.userData.programKey ?? "");
  mat.needsUpdate = true;
}

export default function Halftone() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const seen = new Set<Material>();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      // Glowing parts (bulbs, windows) opt out with userData.noHalftone.
      if (!(o instanceof Mesh) || o.name === "ground" || o.userData.noHalftone) return;
      let scaleMul = 1;
      if (o instanceof SkinnedMesh) {
        // Posed world size vs raw geometry size, divided by what modelMatrix already gives.
        o.geometry.computeBoundingBox();
        const raw = o.geometry.boundingBox!.getSize(new Vector3()).length();
        const world = new Box3().setFromObject(o, true).getSize(new Vector3()).length();
        scaleMul = world / (raw * new Vector3().setFromMatrixColumn(o.matrixWorld, 0).length());
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!(m instanceof MeshStandardMaterial) || m.userData.noHalftone || seen.has(m)) continue;
        seen.add(m);
        patch(m, scaleMul * (m.userData.htScale ?? 1)); // htScale: finer dots for small models
      }
    });
  }, [scene]);

  return null;
}
