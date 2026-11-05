// PMREM equirect→CubeUV fragment
// group: Three.js internals   stage: fragment
// role: converts an equirect map into the CubeUV layout
// owner (minified): _a / __webpackgi_modules__
// source: bundle-0.8.0.mjs, character offset 574403 (original minified file on branch main)

precision mediump float;
precision mediump int;
varying vec3 vOutputDirection;
uniform sampler2D envMap;
#include <common>
void main()  {
	vec3 outputDirection = normalize( vOutputDirection );
	vec2 uv = equirectUv( outputDirection );
	gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );
}
