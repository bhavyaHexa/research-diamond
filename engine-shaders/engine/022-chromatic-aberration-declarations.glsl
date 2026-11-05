// Chromatic aberration declarations
// group: Tone mapping & post-processing   stage: snippet
// role: class ba (inactive in this scene)
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1256909 (original minified file on branch main)

uniform float aberrationIntensity;
vec4 chromaticAberration() {
	vec2 distFromCenter=vUv-0.5;
	vec2 aberrated=aberrationIntensity*pow(distFromCenter,vec2(2.));
	vec4 color=tDiffuseTexelToLinear(texture2D(tDiffuse,vUv));
	vec4 outColor=vec4(tDiffuseTexelToLinear(texture2D(tDiffuse,vUv+aberrated)).r,color.g,tDiffuseTexelToLinear(texture2D(tDiffuse,vUv-aberrated)).b,color.a);
	return outColor;
}
