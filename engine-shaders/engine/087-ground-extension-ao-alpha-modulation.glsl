// Ground extension: AO alpha modulation
// group: Ground, background & shadows   stage: fragment injection
// role: class kg
// owner (minified): e.fragmentShader
// source: bundle-0.8.0.mjs, character offset 1793708 (original minified file on branch main)

#include <output_fragment>
#ifndef OPAQUE
#ifdef USE_AOMAP
#if NUM_DIR_LIGHT_SHADOWS > 0
// TODO find a better solution
float alphaMod = length(reflectedLight.directDiffuse)*4./float(NUM_DIR_LIGHT_SHADOWS);
#else
float alphaMod = 1.;
#endif
float t1 = 1. - ambientOcclusion;
float t2 = max(1. - alphaMod, 0.);
float t = t1 + t2;
gl_FragColor.a *= max(t, 0.);
#endif
#endif
