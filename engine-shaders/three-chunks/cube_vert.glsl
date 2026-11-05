// Three.js r152 ShaderChunk "cube_vert" — identical to stock r152 (ignoring comments/whitespace)

varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}
