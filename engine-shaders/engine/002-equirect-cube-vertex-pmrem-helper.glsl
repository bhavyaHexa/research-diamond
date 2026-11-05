// Equirect→cube vertex (PMREM helper)
// group: Three.js internals   stage: shared snippet
// role: WebGLCubeUVMaps / Us.fromEquirectangularTexture
// owner (minified): n / Us
// source: bundle-0.8.0.mjs, character offset 404852 (original minified file on branch main)

varying vec3 vWorldDirection;
vec3 transformDirection( in vec3 dir, in mat4 matrix )  {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
void main()  {
	vWorldDirection = transformDirection( position, modelMatrix );
#include <begin_vertex>
#include <project_vertex>
}
