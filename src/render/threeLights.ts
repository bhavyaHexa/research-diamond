import {
  EquirectangularReflectionMapping,
  LinearFilter,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLRenderer,
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { PATHS } from "../constants";

// Lighting: the scene HDR lights the metal. The gem HDR is returned as the raw equirect texture
// (512x512, half float, linear filter, no mipmaps), which is what the engine gives the diamonds
// (its diamond program is compiled with ENV_MAP_TYPE 1).
export async function applyLights(renderer: WebGLRenderer, scene: Scene): Promise<Texture> {
  const loader = new RGBELoader();
  const gemHdr = await loader.loadAsync(PATHS.gemEnvironment);
  gemHdr.mapping = EquirectangularReflectionMapping;
  gemHdr.minFilter = LinearFilter;
  gemHdr.magFilter = LinearFilter;
  gemHdr.generateMipmaps = false;

  const lightmap = await loader.loadAsync(PATHS.lightmap);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(lightmap).texture;
  pmrem.dispose();
  lightmap.dispose();

  return gemHdr;
}
