// DoF circular (bokeh) blur
// group: Tone mapping & post-processing   stage: fragment
// role: class Ua
// owner (minified): Ua
// source: bundle-0.8.0.mjs, character offset 1283979 (original minified file on branch main)

#include <common>
varying vec2 vUv;
uniform vec2 colorTextureSize;
uniform float blurRadius;
vec4 CircularBlur() {
	vec4 color=colorTextureTexelToLinear(texture2D(colorTexture,vUv));
#ifdef DOF_MODE
	float blurDist=blurRadius*(2.*color.a-1.);
#else
	float blurDist=blurRadius*color.a;
#endif
	float rnd=PI2*random3(vec3(vUv,frameCount*0.1));
	float costheta=cos(rnd);
	float sintheta=sin(rnd);
	vec4 rotationMatrix=vec4(costheta,-sintheta,sintheta,costheta);
	vec3 colorSum=vec3(0.);
	float weightSum=0.001;
	vec2 ofs;
	vec4 sampleColor;
	setPds();
#pragma unroll_loop_start
	for(int i=0;i<16;i++) {
		ofs=poisson_disk_samples[UNROLLED_LOOP_INDEX];
		ofs=vec2(dot(ofs,rotationMatrix.xy),dot(ofs,rotationMatrix.zw));
		sampleColor=colorTextureTexelToLinear(texture2D(colorTexture,vUv+blurDist*ofs/colorTextureSize.xy));
#ifdef DOF_MODE
		sampleColor.a=abs(sampleColor.a*2.-1.);
		sampleColor.a*=sampleColor.a*sampleColor.a;
#endif
		colorSum+=sampleColor.rgb*sampleColor.a;
		weightSum+=sampleColor.a;
	}
#pragma unroll_loop_end
	colorSum/=weightSum;
	return vec4(saturate(colorSum),1.);
}
void main() {
	gl_FragColor=CircularBlur();
#include <encodings_fragment>
}
