// Simple camera helpers (Sa)
// group: Shared snippets   stage: shared snippet
// role: viewToScreen / screenToView
// owner (minified): Sa
// source: bundle-0.8.0.mjs, character offset 1262982 (original minified file on branch main)

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
