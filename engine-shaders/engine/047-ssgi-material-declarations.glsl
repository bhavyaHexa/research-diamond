// SSGI material declarations
// group: Screen-space effects   stage: snippet
// role: uniforms read by materials
// owner (minified): _c
// source: bundle-0.8.0.mjs, character offset 1394235 (original minified file on branch main)
// note: The `${M(...)}` placeholder is a runtime helper generator; shown here as the linear-texture variant it produces (seen in the compiled program).

uniform float ssaoPower;
uniform float ssgiIntensity;
uniform sampler2D tSSGIMap;
vec4 tSSGIMapTexelToLinear( vec4 value )  {
	return LinearToLinear( value );
}
#ifndef SIMPLE_CAMERA_HELPERS
#define SIMPLE_CAMERA_HELPERS
#ifndef USE_TRANSMISSION
uniform mat4 projectionMatrix;
#endif
vec3 viewToScreen(const in vec3 pos) {
	vec4 projected=projectionMatrix*vec4(pos,1.);
	return vec3(0.5+0.5*projected.xy/projected.w,projected.w);
}
#endif
