// Diamond material vertex
// group: Materials   stage: vertex
// role: class ll (DiamondMaterial)
// owner (minified): ll
// source: bundle-0.8.0.mjs, character offset 1461513 (original minified file on branch main)

#ifndef USE_ENVMAP
#define USE_ENVMAP
#endif
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
	vWorldNormal=(modelMatrix*vec4(normal,0.)).xyz;
#include <begin_vertex>
#include <project_vertex>
	vViewPosition=-mvPosition.xyz;
	vNormal=normalize(normalMatrix*normal);
	vUv=uv;
#include <worldpos_vertex>
	vWorldPosition=worldPosition.xyz;
}
