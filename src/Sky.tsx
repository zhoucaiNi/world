import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, ShaderMaterial } from "three";
import { mixPair, night, palette } from "./theme";

// A gradient sky dome: the horizon matches the fog colour so the far ground melts into it,
// and it deepens to sky blue overhead by day (navy at night).
export default function Sky() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uHorizon: { value: new Color() }, uTop: { value: new Color() } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uTop;
          varying vec3 vDir;
          void main() {
            float h = smoothstep(0.0, 0.55, normalize(vDir).y);
            gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.7)), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );

  useFrame(() => {
    mixPair(palette.sky, night.value, mat.uniforms.uHorizon.value);
    mixPair(palette.skyTop, night.value, mat.uniforms.uTop.value);
  });

  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}
