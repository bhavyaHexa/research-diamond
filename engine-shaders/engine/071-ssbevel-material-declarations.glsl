// SSBevel material declarations
// group: Screen-space effects   stage: snippet
// role: tSSBevelMap
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1578714 (original minified file on branch main)

uniform sampler2D tSSBevelMap;
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
