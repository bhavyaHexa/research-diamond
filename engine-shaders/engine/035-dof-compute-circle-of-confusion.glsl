// DoF compute circle-of-confusion
// group: Tone mapping & post-processing   stage: fragment
// role: class Fa.computeCocMaterial
// owner (minified): Fa
// source: bundle-0.8.0.mjs, character offset 1286161 (original minified file on branch main)

#include <common>
#include <packing>
varying vec2 vUv;
uniform vec2 nearFarBlurScale;
uniform vec2 cameraNearFar;
uniform vec2 focalDepthRange;
float computeCoc() {
	float depth=getDepth(vUv);
	if(depth==1.)return max(nearFarBlurScale.x,nearFarBlurScale.y);
	depth=mix(cameraNearFar.x,cameraNearFar.y,depth);
	float coc=(depth-focalDepthRange.x)/focalDepthRange.y;
	coc=clamp(coc,-1.,1.);
	return(coc>0.?coc*nearFarBlurScale.y:coc*nearFarBlurScale.x);
}
void main() {
	gl_FragColor=vec4(colorTextureTexelToLinear(texture2D(colorTexture,vUv)).rgb,0.5*computeCoc()+0.5);
#include <encodings_fragment>
}
