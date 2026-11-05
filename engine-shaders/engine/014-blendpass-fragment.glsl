// BlendPass fragment
// group: Frame & pass infrastructure   stage: snippet
// role: class It: blends two textures with a caller-supplied expression
// owner (minified): It
// source: bundle-0.8.0.mjs, character offset 1063795 (original minified file on branch main)
// note: `${i}` is an optional caller-supplied declarations string (default empty); `${r}` is the blend expression (default `c = a + b;`, the transparent pass uses `c = vec4(a.rgb * (1. - b.a) + b.rgb * b.a, 1.);`).

varying vec2 vUv;
/*${i}*/ void blend(in vec4 a, in vec4 b, inout vec4 c) {
	/*${r}*/
}
void main()  {
	vec4 texel = vec4(0);
	blend(tDiffuseTexelToLinear ( texture2D( tDiffuse, vUv ) ), tDiffuse2TexelToLinear ( texture2D( tDiffuse2, vUv ) ), texel);
	texel = clamp(texel, vec4(0), vec4(8));
	gl_FragColor = texel;
#include <encodings_fragment>
}
