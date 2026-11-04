import {
  EquirectangularReflectionMapping,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLCubeRenderTarget,
  WebGLRenderer,
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { PATHS } from "../constants";

// Lighting: the scene HDR lights the metal. The gem HDR is returned as a cube map for the
// diamonds, as the engine's own gem environment is.
export async function applyLights(renderer: WebGLRenderer, scene: Scene): Promise<Texture> {
  const loader = new RGBELoader();
  const gemHdr = await loader.loadAsync(PATHS.gemEnvironment);
  gemHdr.mapping = EquirectangularReflectionMapping;
  const gemCube = new WebGLCubeRenderTarget(512).fromEquirectangularTexture(renderer, gemHdr);
  gemHdr.dispose();

  const lightmap = await loader.loadAsync(PATHS.lightmap);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(lightmap).texture;
  scene.environmentRotation.y = 2;
  pmrem.dispose();
  lightmap.dispose();

  return gemCube.texture;
}
