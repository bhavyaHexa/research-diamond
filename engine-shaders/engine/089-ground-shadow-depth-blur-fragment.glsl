// Ground shadow depth blur fragment
// group: Ground, background & shadows   stage: fragment
// role: class kg._shadowBlurMat
// owner (minified): kg
// source: bundle-0.8.0.mjs, character offset 1796459 (original minified file on branch main)

#include <packing>
uniform sampler2D colorTexture;
uniform vec2 size;
uniform vec2 direction;
uniform float step;
varying vec2 vUv;
void main() {
	float sum=0.;
	vec2 uvDelta=step*direction/size;
	sum+=unpackRGBAToDepth(texture2D(colorTexture,vUv-1.*uvDelta))*0.3333;
	sum+=unpackRGBAToDepth(texture2D(colorTexture,vec2(vUv.x,vUv.y)))*0.3333;
	sum+=unpackRGBAToDepth(texture2D(colorTexture,vUv+1.*uvDelta))*0.3333;
	gl_FragColor=packDepthToRGBA(sum);
}
