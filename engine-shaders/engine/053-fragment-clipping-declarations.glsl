// Fragment clipping: declarations
// group: Material extensions   stage: snippet
// role: FragmentClippingExtensionPlugin1 (Hc)
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1434881 (original minified file on branch main)
// note: `${Qc.Circle}` … are the integer values of the clipping-shape enum (Circle/Ellipse/Rectangle/Plane/Sphere).

uniform vec4 fragClippingPosition;
uniform vec4 fragClippingParams;
uniform float fragClippingCamAspect;
#if FRAG_CLIPPING_MODE == /*${Qc.Circle}*/
float fragClippingCircle() {
	vec2 pos = viewToScreen(vViewPosition.xyz).xy;
	float radius = fragClippingParams.x;
	vec2 center = fragClippingPosition.xy;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	return length(pos - center) - radius;
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Ellipse}*/
float fragClippingEllipse() {
	vec2 pos = viewToScreen(vViewPosition.xyz).xy;
	vec2 radius = fragClippingParams.xy;
	vec2 center = fragClippingPosition.xy;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	return length((pos - center) / radius) - 1.0;
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Rectangle}*/
float fragClippingRectangle() {
	vec2 pos = viewToScreen(vViewPosition.xyz).xy;
	vec2 radius = fragClippingParams.xy;
	vec2 center = fragClippingPosition.xy;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	vec2 d = abs(pos - center) - radius;
	return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Plane}*/
float fragClippingPlane() {
	vec3 pos = vViewPosition.xyz;
	vec3 normal = fragClippingParams.xyz;
	float d = dot(pos, normal) - fragClippingParams.w;
	return d;
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Sphere}*/
float fragClippingSphere() {
	vec3 pos = vViewPosition.xyz;
	vec3 center = fragClippingPosition.xyz;
	float radius = fragClippingParams.x;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	return length(pos - center) - radius;
}
#endif
