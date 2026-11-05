// Gamma / sRGB injection
// group: Tone mapping & post-processing   stage: fragment injection
// role: class dh: gl_FragColor = LinearTosRGB(...)  — this is the final encode
// owner (minified): dh
// source: bundle-0.8.0.mjs, character offset 1588413 (original minified file on branch main)

gl_FragColor = LinearTosRGB(gl_FragColor);
#glMarker
