// The main directional light and the ground that catches the ring's shadow.
//
// The light's direction jitters a little every accumulated frame ("spread"), so the 32 shadow
// maps average into one soft contact shadow. The ground draws nothing except that shadow.
import { Color, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, ShadowMaterial, Vector3 } from "three";
import { SETTINGS } from "./settings";

const toLight = new Vector3(...SETTINGS.light.direction).normalize();
// toLight is mutable so the direction can be tuned live: `own.ground.setDirection(x, y, z)`.

export interface Ground {
  light: DirectionalLight;
  setDirection(x: number, y: number, z: number): void;
  /** Move the light by a small random offset (n = frame index), for soft shadows. */
  jitter(n: number, halton: (i: number, b: number) => number): void;
}

export function addLightAndGround(scene: Scene, groundY: number): Ground {
  const light = new DirectionalLight(new Color(SETTINGS.light.color), SETTINGS.light.intensity);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.radius = 2;
  light.shadow.bias = -0.001;
  const cam = light.shadow.camera;
  cam.left = -2; cam.right = 2; cam.top = 2; cam.bottom = -2;
  cam.near = SETTINGS.light.distance - 2.5; cam.far = SETTINGS.light.distance + 2.5;
  cam.updateProjectionMatrix();
  scene.add(light, light.target);

  scene.traverse((o) => {
    if ((o as Mesh).isMesh) { o.castShadow = true; }
  });

  const ground = new Mesh(new PlaneGeometry(8, 8), new ShadowMaterial({ opacity: SETTINGS.light.shadowOpacity }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  // The ground is part of the depth pre-pass, so the gold can reflect it: it shows the white
  // page (plus the shadow) in the previous frame, as it does in the shipped viewer.
  scene.add(ground);
  void MeshBasicMaterial;

  const place = (dir: Vector3) => light.position.copy(dir).normalize().multiplyScalar(SETTINGS.light.distance);
  place(toLight);

  return {
    light,
    setDirection(x, y, z) { toLight.set(x, y, z).normalize(); place(toLight); },
    jitter(n, halton) {
      const s = SETTINGS.light.spread;
      const d = toLight.clone();
      d.x += (halton(n + 1, 5) - 0.5) * 2 * s;
      d.y += (halton(n + 1, 7) - 0.5) * 2 * s;
      d.z += (halton(n + 1, 11) - 0.5) * 2 * s;
      place(d);
    },
  };
}
