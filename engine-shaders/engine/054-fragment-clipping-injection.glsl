// Fragment clipping: injection
// group: Material extensions   stage: fragment injection
// owner (minified): e.fragmentShader
// source: bundle-0.8.0.mjs, character offset 1436732 (original minified file on branch main)
// note: `${Qc.Circle}` … are the integer values of the clipping-shape enum (Circle/Ellipse/Rectangle/Plane/Sphere).

float fragClippingDist = 0.0;
#if FRAG_CLIPPING_MODE == /*${Qc.Circle}*/
fragClippingDist = fragClippingCircle();
#elif FRAG_CLIPPING_MODE == /*${Qc.Ellipse}*/
fragClippingDist = fragClippingEllipse();
#elif FRAG_CLIPPING_MODE == /*${Qc.Rectangle}*/
fragClippingDist = fragClippingRectangle();
#elif FRAG_CLIPPING_MODE == /*${Qc.Plane}*/
fragClippingDist = fragClippingPlane();
#elif FRAG_CLIPPING_MODE == /*${Qc.Sphere}*/
fragClippingDist = fragClippingSphere();
#endif
#if FRAG_CLIPPING_DEBUG
gl_FragColor = vec4(max(fragClippingDist, 0.0), 0.0, 0.0, 1.0);
//    gl_FragColor = vec4(vViewPosition.xyz, 1.0);
#include <encodings_fragment>
return;
#endif
#if FRAG_CLIPPING_INVERSE == 1
if (fragClippingDist > 0.0) discard;
#else
if (fragClippingDist < 0.0) discard;
#endif
