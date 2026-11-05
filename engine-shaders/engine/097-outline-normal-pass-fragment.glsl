// Outline normal pass fragment
// group: Utility & debug   stage: fragment
// owner (minified): n / Yx
// source: bundle-0.8.0.mjs, character offset 2101837 (original minified file on branch main)

uniform vec2 cameraNearFar;
varying vec3 vViewPosition;
vec2 pack16(float value) {
	float sMax=65535.;
	int v=int(clamp(value,0.,1.)*sMax+0.5);
	int digit0=v/256;
	int digit1=v-digit0*256;
	return vec2(float(digit0)/255.,float(digit1)/255.);
}
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
void main() {
	float linearZ=linstep(-cameraNearFar.x,-cameraNearFar.y,-vViewPosition.z);
	vec2 packedZ=pack16(pow(linearZ,0.5));
	gl_FragColor=vec4(packedZ.x,packedZ.y,0.,0.);
}
