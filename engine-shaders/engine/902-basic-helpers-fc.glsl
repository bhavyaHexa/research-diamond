// Basic helpers (fc)
// group: Shared snippets   stage: shared snippet
// role: BASIC_HELPERS: saturate2, luminance… included by SSR/SSGI/contact shadows
// owner (minified): var:fc
// source: bundle-0.8.0.mjs, character offset 1387575 (original minified file on branch main)

#ifndef BASIC_HELPERS
#define BASIC_HELPERS
float saturate2(float v,float mx) {
	return max(0.,min(mx,v));
}
vec3 saturate2(vec3 v) {
	return max(vec3(0.),min(vec3(1.),v));
}
#endif
