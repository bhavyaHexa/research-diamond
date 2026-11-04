// Stage: vertex. Used by: G-buffer writer for the scene (MRT).
// Source: public/shaders/bundle-0.8.0.mjs, character offset 1064584. Body copied unchanged.
#ifdef USE_ALPHAMAP
#define USE_UV 
#endif
#include <uv_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#if IS_GLSL3 > 0
out vec3 vViewPosition;
#else
varying vec3 vViewPosition;
#endif
void main(){
#include <uv_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vViewPosition=-mvPosition.xyz;}
