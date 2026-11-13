// Frame blend fragment (Progressive accumulation)
// group: Frame & pass infrastructure   stage: snippet
// role: class Na: weight·current + weight2·history
// owner (minified): Na
// source: bundle-0.8.0.mjs, character offset 1290885 (original minified file on branch main)

uniform vec4 weight;
uniform vec4 weight2;
varying vec2 vUv;
void main()  {
	vec4 texel = clamp(weight * tDiffuseTexelToLinear ( texture2D( tDiffuse, vUv ) ) + weight2 * tDiffuse2TexelToLinear ( texture2D( tDiffuse2, vUv ) ), vec4(0), vec4(8));
	gl_FragColor = texel;
#include <encodings_fragment>
}
