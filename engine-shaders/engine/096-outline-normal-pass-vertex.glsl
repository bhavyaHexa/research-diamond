// Outline normal pass vertex
// group: Utility & debug   stage: vertex
// role: class Yx
// owner (minified): n / Yx
// source: bundle-0.8.0.mjs, character offset 2101316 (original minified file on branch main)

#ifdef USE_ALPHAMAP
#define USE_UV
#endif
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vViewPosition;
void main() {
#include <skinbase_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
	vViewPosition=-mvPosition.xyz;
}
