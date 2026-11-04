// Stage: vertex. Used by: 16-bit depth packing.
// Source: public/shaders/bundle-0.8.0.mjs, character offset 2101303. Body copied unchanged.
#ifdef USE_ALPHAMAP
#define USE_UV 
#endif
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vViewPosition;void main(){
#include <skinbase_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vViewPosition=-mvPosition.xyz;}
