// Equirect→cube fragment (PMREM helper)
// group: Three.js internals   stage: shared snippet
// role: samples an equirect map for each cube direction
// owner (minified): i / Us
// source: bundle-0.8.0.mjs, character offset 405243 (original minified file on branch main)

uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main()  {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
}
