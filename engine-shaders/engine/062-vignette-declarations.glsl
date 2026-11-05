// Vignette declarations
// group: Tone mapping & post-processing   stage: snippet
// role: class Cp (inactive in this scene)
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1518634 (original minified file on branch main)

uniform float power;
uniform vec3 bgcolor;
vec4 Vignette(in vec4 color) {
	vec2 uv=vUv*(1.-vUv);
	float vig=uv.x*uv.y*16.;
	vig=pow(vig,power);
	return vec4(mix(color.rgb,vec3(bgcolor),1.-vig),color.a);
}
