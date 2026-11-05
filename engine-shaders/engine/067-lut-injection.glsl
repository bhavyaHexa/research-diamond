// LUT injection
// group: Tone mapping & post-processing   stage: fragment injection
// owner (minified): ? / Up
// source: bundle-0.8.0.mjs, character offset 1533655 (original minified file on branch main)

#if USE_LUT == 1
bool isBackground = getDepth(vUv)>0.9999;
#if LUT_BACKGROUND == 1
gl_FragColor = colorLookUp(gl_FragColor);
#else
gl_FragColor = isBackground ? gl_FragColor : colorLookUp(gl_FragColor);
#endif
#endif
#glMarker
