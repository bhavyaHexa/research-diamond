// Debug texture overlay fragment
// group: Utility & debug   stage: fragment
// role: class _d (DebugPlugin.addTexture)
// owner (minified): _d
// source: bundle-0.8.0.mjs, character offset 1670003 (original minified file on branch main)
// note: `${s??""}` is an optional extra snippet.

#include <common>
#include <packing>
uniform float opacity;
uniform samplerCube tDiffuse;
varying vec2 vUv;
void main()  {
	vec4 texel = textureCube( tDiffuse, vec3(cos(vUv.y * PI2) * cos(vUv.x * PI2), sin(vUv.y * PI2), cos(vUv.y * PI2) * sin(vUv.x * PI2)) );
	/*${s??""}*/ gl_FragColor = opacity * texel;
}
