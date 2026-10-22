import * as THREE from 'three';

/** One draw call, no texture download or full-screen postprocessing. */
export function createSky() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x649bbf) },
      horizon: { value: new THREE.Color(0xc5d9d8) },
      sunDirection: { value: new THREE.Vector3(-22, 38, 19).normalize() },
    },
    vertexShader: `varying vec3 vSky;
      void main() {
        vSky = position;
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDirection;
      varying vec3 vSky;
      void main() {
        vec3 direction = normalize(vSky);
        float height = max(direction.y, 0.0);
        vec3 color = mix(horizon, zenith, pow(height, 0.55));
        float sun = max(dot(direction, sunDirection), 0.0);
        color += vec3(1.0, 0.73, 0.40) * (pow(sun, 24.0) * 0.15 + pow(sun, 600.0) * 0.65);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'atmosphere';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
