// Bloom fragment (5 PASS_STEP variants)
// group: Tone mapping & post-processing   stage: fragment
// role: class Ra: prefilter, down, up, combine
// owner (minified): ? / Ra
// source: bundle-0.8.0.mjs, character offset 1273674 (original minified file on branch main)

uniform float intensity;
uniform float opacity;
uniform vec2 tDiffuseSize;
varying vec2 vUv;
uniform float weight;
#if PASS_STEP == 0
uniform vec4 prefilter;
vec4 Prefilter(vec4 c) {
	if(getDepth(vUv)>0.999) {
		return vec4(0.);
	}
	float brightness=max(c.r,max(c.g,c.b));
	float soft=brightness+prefilter.x*(prefilter.y-1.);
	soft=clamp(soft,0.,prefilter.z);
	soft=soft*soft*prefilter.w;
	float contribution=max(soft,brightness-prefilter.x);
	contribution/=max(brightness,0.001);
	return vec4(c.rgb*contribution,c.a);
}
#endif
vec4 Sample(vec2 uv) {
	return tDiffuseTexelToLinear(texture2D(tDiffuse,uv));
}
vec4 SampleBox(vec2 uv,float delta) {
	vec4 o=vec2(-delta,delta).xxyy/tDiffuseSize.xyxy;
	vec4 s=Sample(uv+o.xy)+Sample(uv+o.zy)+Sample(uv+o.xw)+Sample(uv+o.zw);
	return s*0.25;
}
void main() {
#if PASS_STEP == 0
	gl_FragColor=weight*Prefilter(SampleBox(vUv,1.));
	gl_FragColor.a=1.;
#elif PASS_STEP == 1
	gl_FragColor=weight*(SampleBox(vUv,1.));
	gl_FragColor.a=1.;
#elif PASS_STEP == 2
	gl_FragColor=(SampleBox(vUv,0.5));
	gl_FragColor.a=1.;
#elif PASS_STEP == 3
	vec4 texel=tSourceTexelToLinear(texture2D(tSource,vUv));
	vec4 bloom=intensity*SampleBox(vUv,0.5).rgba;
	float brightness=max(bloom.r,max(bloom.g,bloom.b));
	texel.rgb+=bloom.rgb;
	texel.a=min(1.,texel.a+brightness);
	gl_FragColor=texel;
#elif PASS_STEP == 4
	vec4 texel=vec4(0.);
	texel.rgb+=intensity*SampleBox(vUv,0.5).rgb;
	texel.a=1.;
	gl_FragColor=texel;
#endif
#include <encodings_fragment>
}
