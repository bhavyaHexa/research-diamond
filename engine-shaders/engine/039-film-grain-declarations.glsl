// Film grain declarations
// group: Tone mapping & post-processing   stage: snippet
// role: class io (inactive in this scene)
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1313570 (original minified file on branch main)

uniform float grainIntensity;
uniform bool grainMultiply;
vec4 grain(in vec4 color) {
	float x=(vUv.x+4.)*(vUv.y+4.)*(10.);
	vec4 grain=vec4(mod((mod(x,13.)+1.)*(mod(x,123.)+1.),0.01)-0.005)*grainIntensity;
	vec4 outColor=color;
	if(grainMultiply) {
		grain=1.-grain;
		outColor.rgb=color.rgb*vec3(grain);
	} else {
		outColor.rgb=color.rgb+vec3(grain);
	}
	return outColor;
}
