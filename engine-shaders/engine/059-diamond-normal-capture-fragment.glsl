// Diamond normal-capture fragment
// group: Materials   stage: fragment
// role: writes normal (rgb) + distance (a) into the cube
// owner (minified): tl
// source: bundle-0.8.0.mjs, character offset 1454671 (original minified file on branch main)

varying vec3 vNormal;
varying vec3 vecPosition;
uniform float radius;
void main() {
	vec3 color=normalize(vNormal);
	color=color*0.5+0.5;
	gl_FragColor=vec4(color.x,color.y,color.z,length(vecPosition)/radius);
}
