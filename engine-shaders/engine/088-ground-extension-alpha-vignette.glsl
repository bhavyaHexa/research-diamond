// Ground extension: alpha vignette
// group: Ground, background & shadows   stage: fragment injection
// role: class kg
// owner (minified): e.fragmentShader
// source: bundle-0.8.0.mjs, character offset 1794539 (original minified file on branch main)
// note: `alphaVignetteAxis` is a swizzle string (e.g. `x`, `y`) chosen by the plugin.

#include <output_fragment>
#ifndef OPAQUE
float weight = 0.;
#ifdef USE_UV
weight = 2.*abs(length(0.5 - vUv./*${this.alphaVignetteAxis}*/));
#endif
#if defined(USE_LIGHTMAP) || defined(USE_AOMAP)
weight = 2.*abs(length(0.5 - vAoMapUv./*${this.alphaVignetteAxis}*/));
#endif
weight = min(1., max(0., weight))-0.5;
weight = min(1., max(0., 1.0-2.*weight));
weight = pow(weight, 1.5);
gl_FragColor.a *= weight;
//gl_FragColor.rgb /= max(0.01, weight);
gl_FragColor = saturate(gl_FragColor);
//gl_FragColor.a = 0.5;
#endif
