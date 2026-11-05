// Custom bump map: vertex injection
// group: Material extensions   stage: vertex injection
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1367296 (original minified file on branch main)

#if defined(CUSTOM_BUMP_MAP_ENABLED) && CUSTOM_BUMP_MAP_ENABLED > 0
varying vec2 vCustomBumpUv;
uniform mat3 customBumpUvTransform;
#endif
