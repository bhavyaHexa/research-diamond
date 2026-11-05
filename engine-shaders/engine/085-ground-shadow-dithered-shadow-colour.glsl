// Ground shadow: dithered shadow colour
// group: Ground, background & shadows   stage: snippet
// role: class Ig
// owner (minified): Ig
// source: bundle-0.8.0.mjs, character offset 1790503 (original minified file on branch main)

float shadow = getShadowMask();
//shift the color by dither_shift
shadow = clamp(shadow + mix(-1./512., 1./512., rand( gl_FragCoord.xy )), 0., 1.);
float last = unpackRGBAToDepth(texture2D(tLastThis, vUv));
gl_FragColor = packDepthToRGBA(mix(last, shadow, opacity));
//if not useMovingAverage:
//gl_FragColor = packDepthToRGBA(shadow * opacity + last);
