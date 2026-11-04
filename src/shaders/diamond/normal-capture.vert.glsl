// Stage: vertex. Used by: Diamond facet-normal capture pass (DiamondPlugin).
// Source: public/shaders/bundle-0.8.0.mjs, character offset 1454300. Line breaks and indentation added; tokens unchanged.
varying vec3 vNormal;
varying vec3 vecPosition;
uniform mat4 offsetMatrixInv;
uniform vec3 offsetCenter;
void main(){
	vNormal=normalize((offsetMatrixInv*vec4(normal,0.)).xyz);
	vecPosition=(modelMatrix*offsetMatrixInv*vec4(position-offsetCenter,1.)).xyz;
	gl_Position=projectionMatrix*modelViewMatrix*offsetMatrixInv*vec4(position-offsetCenter,1.);
}
